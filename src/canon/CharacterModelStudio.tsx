import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Plus, RotateCcw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { characterModelStorage, styleBibleStorage } from "../core/storage";
import { resolveCharacterVisualState, type CharacterVisualState, type ProjectStyleBible } from "./styleBible";
import { type CharacterModelRecord, type ScarOverlay } from "./characterModels";
import "./characterModelStudio.css";

type ProjectChoice = { id: string; name: string };
const timestamp = () => new Date().toISOString();
const normalizeName = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
const scarsAreAbsent = (value?: string) => !value?.trim() || /^(none|no scars?|removed|cleared|not present|no visible scars?)$/i.test(value.trim());

function disposeObject(root: THREE.Object3D) {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(item => item.dispose());
    else if (material) material.dispose();
  });
}
function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) { group.remove(child); disposeObject(child); }
}
function material(color: string, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}
function addMesh(group: THREE.Group, geometry: THREE.BufferGeometry, color: string, position: [number,number,number], scale?: [number,number,number]) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function createProceduralCharacter(group: THREE.Group) {
  const skin = "#d5ad92", hair = "#282638", clothes = "#536d9d", trousers = "#292f42", shoes = "#171b24";
  addMesh(group,new THREE.SphereGeometry(.32,32,24),skin,[0,2.04,0],[.82,1.08,.78]);
  addMesh(group,new THREE.SphereGeometry(.335,32,24),hair,[0,2.245,-.035],[1.04,.63,.93]);
  addMesh(group,new THREE.SphereGeometry(.25,24,20),hair,[0,1.99,-.19],[1.15,1.1,.8]);
  addMesh(group,new THREE.CapsuleGeometry(.29,.57,5,12),clothes,[0,1.34,0],[1.02,1,0.75]);
  addMesh(group,new THREE.CylinderGeometry(.105,.13,.62,16),skin,[-.4,1.36,0],[1,1,.85]).rotation.z=-.17;
  addMesh(group,new THREE.CylinderGeometry(.105,.13,.62,16),skin,[.4,1.36,0],[1,1,.85]).rotation.z=.17;
  addMesh(group,new THREE.CapsuleGeometry(.12,.62,5,12),trousers,[-.16,.62,0],[1,1,.9]);
  addMesh(group,new THREE.CapsuleGeometry(.12,.62,5,12),trousers,[.16,.62,0],[1,1,.9]);
  addMesh(group,new THREE.SphereGeometry(.14,20,16),shoes,[-.17,.12,.045],[1,.62,1.55]);
  addMesh(group,new THREE.SphereGeometry(.14,20,16),shoes,[.17,.12,.045],[1,.62,1.55]);
  addMesh(group,new THREE.SphereGeometry(.035,16,12),"#f5e7d5",[-.095,2.055,.235],[1,1,.45]);
  addMesh(group,new THREE.SphereGeometry(.035,16,12),"#f5e7d5",[.095,2.055,.235],[1,1,.45]);
  addMesh(group,new THREE.SphereGeometry(.018,12,8),"#25222b",[-.095,2.055,.255],[1,1,.45]);
  addMesh(group,new THREE.SphereGeometry(.018,12,8),"#25222b",[.095,2.055,.255],[1,1,.45]);
  addMesh(group,new THREE.ConeGeometry(.04,.1,12),skin,[0,1.99,.255]);
  addMesh(group,new THREE.TorusGeometry(.09,.009,5,24,Math.PI), "#754e4b",[0,1.94,.235]);
}

function normalizedModel(model: THREE.Object3D) {
  const initial = new THREE.Box3().setFromObject(model);
  const initialSize = initial.getSize(new THREE.Vector3());
  if (!Number.isFinite(initialSize.y) || initialSize.y < 0.01) throw new Error("The GLB has no measurable 3D geometry.");
  model.scale.setScalar(2.5 / initialSize.y);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= box.min.y;
  model.position.z -= center.z;
}

export default function CharacterModelStudio({ projectId, projects }: { projectId: string; projects: ProjectChoice[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rootRef = useRef<THREE.Group | null>(null);
  const scarRootRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boundsRef = useRef(new THREE.Box3(new THREE.Vector3(-.5,0,-.3),new THREE.Vector3(.5,2.5,.3)));
  const [models, setModels] = useState<CharacterModelRecord[]>([]);
  const [styleBible, setStyleBible] = useState<ProjectStyleBible | null>(null);
  const [modelId, setModelId] = useState("");
  const [stateId, setStateId] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelRevision, setModelRevision] = useState(0);
  const [message, setMessage] = useState("Upload a GLB character model or create a 3D blockout. Approved chapter states determine which scars should be visible.");
  const [frontFace, setFrontFace] = useState<"positive-z"|"negative-z">("positive-z");

  useEffect(() => {
    let alive = true;
    if (!projectId) { setModels([]); setStyleBible(null); setModelId(""); setStateId(""); return; }
    setBusy(true);
    void Promise.all([characterModelStorage.list(projectId), styleBibleStorage.load(projectId)]).then(([loadedModels,bible]) => {
      if (!alive) return;
      setModels(loadedModels); setStyleBible(bible ?? null);
      setModelId(current => loadedModels.some(model => model.id === current) ? current : loadedModels[0]?.id ?? "");
      setMessage("Loaded " + loadedModels.length + " saved character model" + (loadedModels.length === 1 ? "" : "s") + " for this project.");
    }).catch(error => { if (alive) setMessage(error instanceof Error ? error.message : "Could not load character models."); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [projectId]);

  const selectedProfile = useMemo(() => models.find(model => model.id === modelId), [models, modelId]);
  const statesForCharacter = useMemo(() => styleBible?.characterStates.filter(state =>
    selectedProfile && normalizeName(state.characterName) === normalizeName(selectedProfile.characterName) && state.status === "approved"
  ).sort((a,b)=>a.storyOrder-b.storyOrder) ?? [], [styleBible, selectedProfile]);
  const selectedState = useMemo(() => statesForCharacter.find(state => state.id === stateId) ?? statesForCharacter[statesForCharacter.length-1], [statesForCharacter,stateId]);
  const selectedModel = useMemo(() => {
    if (!selectedProfile) return undefined;
    const variants = models.filter(model => normalizeName(model.characterName) === normalizeName(selectedProfile.characterName));
    if (selectedState) {
      const eligible = variants.filter(model => (model.storyOrder ?? 0) <= selectedState.storyOrder)
        .sort((a,b)=>(a.storyOrder ?? 0)-(b.storyOrder ?? 0));
      return eligible[eligible.length-1];
    }
    return variants.find(model => !model.characterStateId) ?? selectedProfile;
  }, [models, selectedProfile, selectedState]);
  const resolved = selectedProfile && selectedState && styleBible
    ? resolveCharacterVisualState(styleBible.characterStates, selectedProfile.characterName, selectedState.storyOrder) : undefined;
  const scarsAbsent = scarsAreAbsent(resolved?.traits.scars);
  const activeScars = selectedModel && selectedState && !scarsAbsent
    ? selectedModel.scarOverlays.filter(scar => scar.introducedAtOrder <= selectedState.storyOrder && (scar.removedAtOrder === undefined || selectedState.storyOrder < scar.removedAtOrder))
    : [];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setMessage("WebGL is unavailable in this browser. The 3D viewer cannot start on this device.");
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10151f");
    const camera = new THREE.PerspectiveCamera(35, Math.max(1,host.clientWidth)/Math.max(1,host.clientHeight),0.01,100);
    camera.position.set(0,1.45,5.8);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
    renderer.setSize(host.clientWidth,host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);
    const ambient = new THREE.HemisphereLight("#dce7ff","#3b3241",2.0); scene.add(ambient);
    const key = new THREE.DirectionalLight("#fff0dc",3.2); key.position.set(3,5,4); key.castShadow = true; scene.add(key);
    const rim = new THREE.DirectionalLight("#91b9ff",2.2); rim.position.set(-4,3,-3); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.8,64),new THREE.MeshStandardMaterial({color:"#1a2230",roughness:1}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-.025; floor.receiveShadow=true; scene.add(floor);
    const root = new THREE.Group(); scene.add(root);
    const scarRoot = new THREE.Group(); scene.add(scarRoot);
    const controls = new OrbitControls(camera,renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor=.08; controls.minDistance=2.1; controls.maxDistance=11;
    controls.target.set(0,1.25,0); controls.update();
    sceneRef.current=scene; rootRef.current=root; scarRootRef.current=scarRoot; rendererRef.current=renderer; cameraRef.current=camera; controlsRef.current=controls;
    let frame=0;
    const animate=()=>{frame=window.requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};
    animate();
    const resize=()=>{if(!hostRef.current)return;const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);};
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    observer?.observe(host);window.addEventListener("resize",resize);
    return ()=>{window.cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener("resize",resize);controls.dispose();clearGroup(root);clearGroup(scarRoot);renderer.dispose();if(renderer.domElement.parentNode===host)host.removeChild(renderer.domElement);sceneRef.current=null;rootRef.current=null;scarRootRef.current=null;rendererRef.current=null;cameraRef.current=null;controlsRef.current=null;};
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    clearGroup(root);
    const inner = new THREE.Group(); root.add(inner);
    let cancelled = false;
    let objectUrl: string | undefined;
    const finish = (notice: string) => {
      if (cancelled) return;
      boundsRef.current = new THREE.Box3().setFromObject(root);
      if (boundsRef.current.isEmpty()) boundsRef.current.set(new THREE.Vector3(-.5,0,-.3),new THREE.Vector3(.5,2.5,.3));
      setModelRevision(value=>value+1);
      if (notice) setMessage(notice);
    };
    if (selectedModel?.sourceType === "uploaded-glb" && selectedModel.modelBlob) {
      objectUrl = URL.createObjectURL(selectedModel.modelBlob);
      new GLTFLoader().load(objectUrl, gltf => {
        if (cancelled) { disposeObject(gltf.scene); return; }
        try { normalizedModel(gltf.scene); inner.add(gltf.scene); finish("Loaded " + selectedModel.fileName + ". Orbit to inspect the model; adjust scar overlays below."); }
        catch (error) { createProceduralCharacter(inner); finish(error instanceof Error ? error.message + " Showing a blockout instead." : "Invalid model. Showing a blockout instead."); }
      }, undefined, () => {
        if (cancelled) return;
        createProceduralCharacter(inner); finish("The GLB could not be loaded. Showing the procedural blockout; try a self-contained GLB.");
      });
    } else {
      createProceduralCharacter(inner);
      finish(selectedModel ? "Showing the procedural 3D blockout for " + selectedModel.characterName + ". Upload a GLB for the actual character model." : "Create a character blockout or upload a GLB model to begin.");
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selectedModel?.id, selectedModel?.sourceType, selectedModel?.modelBlob]);

  useEffect(() => {
    const scarRoot = scarRootRef.current;
    if (!scarRoot) return;
    clearGroup(scarRoot);
    if (!selectedModel || !selectedState || scarsAbsent || !resolved) return;
    const bounds = boundsRef.current, size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    if (bounds.isEmpty()) return;
    const front = selectedModel.frontFace === "positive-z" ? 1 : -1;
    for (const scar of activeScars) {
      const x = center.x + scar.x * size.x;
      const y = center.y + scar.y * size.y;
      const z = center.z + front * (Math.abs(scar.z) * size.z + 0.006);
      const angle = scar.angle * Math.PI / 180;
      const half = scar.length * size.y / 2;
      const dx = Math.cos(angle) * half, dy = Math.sin(angle) * half;
      const points = [new THREE.Vector3(x-dx,y-dy,z),new THREE.Vector3(x,y,z+front*.002),new THREE.Vector3(x+dx,y+dy,z)];
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve,10,Math.max(.003,size.y*.0024),5,false);
      const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:scar.color,roughness:.6,emissive:scar.color,emissiveIntensity:.12}));
      mesh.userData.scarId = scar.id;
      scarRoot.add(mesh);
    }
  }, [selectedModel, selectedState, resolved?.latest.id, scarsAbsent, activeScars.length, modelRevision]);

  async function persistModel(next: CharacterModelRecord, success: string, shareScars = false) {
    setBusy(true);
    try {
      const updated = { ...next, updatedAt: timestamp() };
      const sameCharacter = models.filter(model => normalizeName(model.characterName) === normalizeName(updated.characterName));
      let writes: CharacterModelRecord[] = [updated];
      if (shareScars) {
        writes = sameCharacter.map(model => model.id === updated.id ? updated : { ...model, scarOverlays: updated.scarOverlays, updatedAt: updated.updatedAt });
        if (!writes.some(model => model.id === updated.id)) writes.push(updated);
      }
      for (const record of writes) await characterModelStorage.save(record);
      setModels(current => {
        const byId = new Map(current.map(model => [model.id, model]));
        for (const record of writes) byId.set(record.id, record);
        return [...byId.values()].sort((a,b)=>a.characterName.localeCompare(b.characterName)||(a.storyOrder??0)-(b.storyOrder??0));
      });
      setModelId(updated.id); setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the character model."); }
    finally { setBusy(false); }
  }

  async function createBlockout() {
    const name = characterName.trim();
    if (!projectId || !name) { setMessage("Enter the exact character name before creating a blockout."); return; }
    const existingBase = models.find(model => normalizeName(model.characterName) === normalizeName(name) && !model.characterStateId);
    if (existingBase) { setModelId(existingBase.id); setMessage("A base model already exists. Choose a chapter state and upload a separate GLB variant to show aging or design changes."); return; }
    const existingCharacter = models.find(model => normalizeName(model.characterName) === normalizeName(name));
    const now = timestamp();
    const model: CharacterModelRecord = { id: crypto.randomUUID(), projectId, characterName: name, storyOrder: 0, sourceType: "procedural", fileName: "", frontFace: existingCharacter?.frontFace ?? "positive-z", scarOverlays: existingCharacter?.scarOverlays ?? [], createdAt: now, updatedAt: now };
    await persistModel(model,"Created a 3D blockout for " + name + ". It is a preview rig, not a finished character sculpt.");
  }
  async function uploadModel(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file) return;
    try {
      if (!file.name.toLocaleLowerCase().endsWith(".glb")) throw new Error("Only self-contained .glb files are supported. External .gltf assets are not bundled reliably.");
      if (file.size > 15*1024*1024) throw new Error("GLB files must be 15 MB or smaller for local storage and project export.");
      const name = characterName.trim() || file.name.replace(/\.glb$/i,"");
      if (!name) throw new Error("Enter the character name first.");
      const stateForUpload = selectedState && normalizeName(selectedState.characterName) === normalizeName(name) ? selectedState : undefined;
      const existing = models.find(model=>normalizeName(model.characterName)===normalizeName(name) && model.characterStateId === stateForUpload?.id);
      const existingCharacter = models.find(model=>normalizeName(model.characterName)===normalizeName(name));
      const now = timestamp();
      const model: CharacterModelRecord = existing
        ? { ...existing, characterName:name, characterStateId:stateForUpload?.id, storyOrder:stateForUpload?.storyOrder ?? 0, sourceType:"uploaded-glb", fileName:file.name, modelBlob:file, frontFace, updatedAt:now }
        : { id:crypto.randomUUID(),projectId,characterName:name,characterStateId:stateForUpload?.id,storyOrder:stateForUpload?.storyOrder ?? 0,sourceType:"uploaded-glb",fileName:file.name,modelBlob:file,frontFace,scarOverlays:existingCharacter?.scarOverlays ?? [],createdAt:now,updatedAt:now };
      await persistModel(model,"Saved " + file.name + " as " + name + (stateForUpload ? "'s model variant for " + stateForUpload.chapterLabel : "'s base model") + ".");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import the GLB model."); }
    finally { input.value = ""; }
  }
  async function updateScar(id: string, patch: Partial<ScarOverlay>) {
    if (!selectedModel) return;
    const next = { ...selectedModel, scarOverlays: selectedModel.scarOverlays.map(scar=>scar.id===id?{...scar,...patch}:scar) };
    await persistModel(next,"Updated the scar overlay. The change is saved locally.",true);
  }
  async function addScar() {
    if (!selectedModel || !selectedState || scarsAbsent) { setMessage("Add and approve a character state that records the scar before placing it on the model."); return; }
    const overlay: ScarOverlay = { id:crypto.randomUUID(),characterStateId:selectedState.id,introducedAtOrder:selectedState.storyOrder,label:"Scar · "+selectedState.chapterLabel,x:.03,y:.34,z:.5,length:.075,angle:45,color:"#8b343b" };
    await persistModel({...selectedModel,scarOverlays:[...selectedModel.scarOverlays,overlay]},"Added a scar overlay from " + selectedState.chapterLabel + ". Adjust its position on the model below.",true);
  }
  async function recordScarRemoval() {
    if (!selectedModel || !selectedState) return;
    const next = { ...selectedModel, scarOverlays:selectedModel.scarOverlays.map(scar=>scar.introducedAtOrder<selectedState.storyOrder && (scar.removedAtOrder===undefined || scar.removedAtOrder>selectedState.storyOrder)?{...scar,removedAtOrder:selectedState.storyOrder}:scar) };
    await persistModel(next,"Recorded scar removal at " + selectedState.chapterLabel + ". Earlier flashbacks retain the old scar.",true);
  }
  async function removeModel() {
    if (!selectedModel) return;
    setBusy(true);
    try { await characterModelStorage.remove(selectedModel.id,projectId);setModels(current=>current.filter(model=>model.id!==selectedModel.id));setModelId("");setMessage("Removed the local 3D model and its overlays."); }
    catch(error){setMessage(error instanceof Error?error.message:"Could not remove model.");}
    finally{setBusy(false);}
  }
  async function resetView() {
    const camera = cameraRef.current, controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(0,1.45,5.8);
    controls.target.set(0,1.25,0);
    controls.update();
    setMessage("View centered. Drag to orbit and scroll to zoom.");
  }

  const stateOptions: CharacterVisualState[] = statesForCharacter;
  const hasTextScar = !!resolved?.traits.scars && !scarsAbsent;
  const activeProject = projects.find(project => project.id === projectId);
  return <section className="character-model-studio">
    <header className="character-model-head"><div><small>3D CHARACTER WORKSPACE · CHAPTER-AWARE</small><h2><Box size={20}/> Character model studio</h2><p>Attach a GLB model, choose an approved chapter state, and place scar overlays that appear only from their introduction onward.</p><small className="character-model-project-name">{activeProject?.name ?? "No active project"}</small></div></header>
    {!projectId ? <p className="character-model-message">Choose a project to create a character model.</p> : <>
      <div className="character-model-create">
        <label><span>Character name (must match Style Bible)</span><input value={characterName} onChange={event=>setCharacterName(event.target.value)} placeholder="e.g. Ren"/></label>
        <button disabled={busy || !characterName.trim()} onClick={()=>void createBlockout()}><Plus size={14}/> Create blockout</button>
        <label className="character-model-upload"><Upload size={15}/><span>Upload GLB</span><input type="file" accept=".glb,model/gltf-binary" hidden disabled={busy} onChange={event=>void uploadModel(event)}/></label>
      </div>
      <div className="character-model-controls">
        <label><span>Character model</span><select value={modelId} onChange={event=>{setModelId(event.target.value);const model=models.find(item=>item.id===event.target.value);if(model){setCharacterName(model.characterName);setFrontFace(model.frontFace);}}}><option value="">Choose a model…</option>{models.map(model=><option key={model.id} value={model.id}>{model.characterName}{model.characterStateId ? " · " + (styleBible?.characterStates.find(state=>state.id===model.characterStateId)?.chapterLabel ?? "chapter variant") : " · base"}{model.sourceType==="procedural"?" · blockout":" · GLB"}</option>)}</select></label>
        <label><span>Approved chapter state</span><select value={selectedState?.id ?? ""} onChange={event=>setStateId(event.target.value)} disabled={!stateOptions.length}><option value="">No approved state</option>{stateOptions.map(state=><option key={state.id} value={state.id}>{state.chapterLabel} · order {state.storyOrder}</option>)}</select></label>
        <label><span>Model front</span><select value={selectedModel?.frontFace ?? frontFace} disabled={!selectedModel} onChange={event=>{const value=event.target.value as "positive-z"|"negative-z";setFrontFace(value);if(selectedModel)void persistModel({...selectedModel,frontFace:value},"Updated model front orientation.");}}><option value="positive-z">+Z facing camera</option><option value="negative-z">−Z facing camera</option></select></label>
        <button disabled={!selectedModel} onClick={()=>void resetView()}><RotateCcw size={14}/> Reset view</button>
      </div>
      <p className="character-model-message" role="status">{message}</p>
      <div className="character-model-layout">
        <div className="character-model-viewer"><div ref={hostRef} className="character-model-canvas"/><div className="character-model-viewer-hint">Drag to orbit · scroll to zoom · touch supported</div>{selectedModel&&<div className="character-model-viewer-label"><b>{selectedModel.characterName}</b><span>{selectedState?.chapterLabel ?? "No approved visual state"}</span></div>}</div>
        <aside className="character-model-inspector">
          <h3>Visual continuity</h3>
          {selectedModel ? <><div className="character-model-meta"><b>{selectedModel.sourceType==="uploaded-glb" ? selectedModel.fileName : "Procedural blockout rig"}</b><small>{selectedModel.sourceType==="uploaded-glb" ? "Local GLB · editable model view" : "Preview geometry · not final character art"}</small></div>
            {!selectedState && <div className="character-model-warning"><ShieldAlert size={15}/><p>No approved visual state matches this character. Add a state in Style Bible and approve it before using it as canon.</p></div>}
            {selectedState && <div className="character-model-state"><small>APPROVED STATE</small><b>{selectedState.chapterLabel}</b><span>Story order {selectedState.storyOrder} · {resolved?.traits.age || "Age unknown"}</span><p>Hair: {resolved?.traits.hair || "Unknown"}</p><p>Scars: {resolved?.traits.scars || "Unknown"}</p><p>Outfit: {resolved?.traits.outfit || "Unknown"}</p></div>}
            {selectedState && hasTextScar && activeScars.length===0 && <div className="character-model-warning"><ShieldAlert size={15}/><p>A scar is recorded in the timeline, but no 3D overlay is placed yet. Add a scar marker and adjust it to match the model.</p></div>}
            {selectedState && hasTextScar && <button className="character-model-primary" disabled={busy} onClick={()=>void addScar()}><Plus size={14}/> Add scar overlay</button>}
            {selectedState && scarsAbsent && selectedModel.scarOverlays.some(scar=>scar.introducedAtOrder<selectedState.storyOrder) && <button className="character-model-secondary" disabled={busy} onClick={()=>void recordScarRemoval()}>Record scar removal at this chapter</button>}
            <div className="character-model-scar-list">{activeScars.map(scar=><article key={scar.id}><header><b>{scar.label}</b><button aria-label="Remove scar marker" onClick={()=>void updateScar(scar.id,{removedAtOrder:selectedState?.storyOrder ?? scar.introducedAtOrder})}><Trash2 size={13}/></button></header>
              {([["x","Horizontal position",-0.5,0.5,scar.x],["y","Vertical position",-0.5,0.5,scar.y],["z","Surface depth",0,0.5,Math.abs(scar.z)],["length","Length",0.01,0.25,scar.length],["angle","Angle",-180,180,scar.angle]] as Array<[keyof ScarOverlay,string,number,number,number]>).map(([key,label,min,max,value])=><label key={key}><span>{label}<small>{Number(value).toFixed(2)}</small></span><input type="range" min={min} max={max} step={key==="angle"?1:0.01} value={value} onChange={event=>void updateScar(scar.id,{[key]:Number(event.target.value)} as Partial<ScarOverlay>)}/></label>)}
              <label><span>Scar color</span><input type="color" value={scar.color} onChange={event=>void updateScar(scar.id,{color:event.target.value})}/></label>
            </article>)}</div>
            <button className="character-model-remove" disabled={busy} onClick={()=>void removeModel()}><Trash2 size={13}/> Remove model</button>
          </> : <p className="character-model-empty">Create a blockout or upload a GLB model to begin.</p>}
        </aside>
      </div>
      <p className="character-model-footnote">The model preview does not generate a finished anime sculpt. GLB files stay local to this browser and are included in project export when supported. Scar markers are editable overlays, not permanent edits to the source mesh.</p>
    </>}
  </section>;
}
