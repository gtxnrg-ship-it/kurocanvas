import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, Plus, RefreshCw, RotateCcw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { characterModelStorage, styleBibleStorage } from "../core/storage";
import { resolveCharacterVisualState, type CharacterVisualState, type ProjectStyleBible } from "./styleBible";
import { resolveActiveScarOverlays, selectCharacterModelVariant, type CharacterModelRecord, type ProceduralCharacterTraits, type ScarOverlay } from "./characterModels";
import { describeCharacterModelAgentCommand, type CharacterCameraPreset, type CharacterModelAgentCommand, type CharacterMotionPreset } from "./characterModelAgentTools";
import "./characterModelStudio.css";

type ProjectChoice = { id: string; name: string };
const timestamp = () => new Date().toISOString();
const CAMERA_PRESETS: Record<CharacterCameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  front: { position: [0, 1.45, 5.8], target: [0, 1.25, 0] },
  "three-quarter-left": { position: [3.8, 1.55, 4.5], target: [0, 1.25, 0] },
  "three-quarter-right": { position: [-3.8, 1.55, 4.5], target: [0, 1.25, 0] },
  "profile-left": { position: [5.8, 1.4, 0], target: [0, 1.25, 0] },
  "profile-right": { position: [-5.8, 1.4, 0], target: [0, 1.25, 0] },
  back: { position: [0, 1.45, -5.8], target: [0, 1.25, 0] },
  "close-up": { position: [0, 2.05, 2.8], target: [0, 1.92, 0] },
  "full-body": { position: [0, 1.45, 7.8], target: [0, 1.2, 0] },
  "high-angle": { position: [0, 5.7, 3.6], target: [0, 1.1, 0] },
};
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
function createProceduralCharacter(group: THREE.Group, traits?: ProceduralCharacterTraits) {
  const hairText = traits?.hair?.toLocaleLowerCase() ?? "";
  const outfitText = traits?.outfit?.toLocaleLowerCase() ?? "";
  const skinText = traits?.skinTone?.toLocaleLowerCase() ?? "";
  const eyeText = traits?.eyeColor?.toLocaleLowerCase() ?? "";
  const longHair = /long|shoulder|grown.?out|waist|flowing|back.?length|ponytail|braid/i.test(hairText);
  const shavedHair = /shaved|buzz.?cut|bald/i.test(hairText);
  const hair = /silver|white|grey|gray/i.test(hairText) ? "#c7cad5"
    : /blond|golden|yellow/i.test(hairText) ? "#d1ad62"
    : /red|ginger|auburn/i.test(hairText) ? "#9d5140"
    : /blue/i.test(hairText) ? "#3e5797"
    : /green|emerald/i.test(hairText) ? "#3c7868"
    : /purple|violet/i.test(hairText) ? "#77539b"
    : /pink/i.test(hairText) ? "#c8799a"
    : /brown|chestnut/i.test(hairText) ? "#51392f" : "#282638";
  const clothes = /red|crimson|maroon/i.test(outfitText) ? "#8f3c4a"
    : /white|cream/i.test(outfitText) ? "#d7d7d2"
    : /green|emerald/i.test(outfitText) ? "#3d796a"
    : /purple|violet/i.test(outfitText) ? "#654e91"
    : /blue|navy/i.test(outfitText) ? "#425d91"
    : /black|dark/i.test(outfitText) ? "#252632"
    : /brown|leather/i.test(outfitText) ? "#634a3b" : "#536d9d";
  const skin = /deep|very dark|dark brown|ebony/i.test(skinText) ? "#603c31"
    : /dark|brown|mahogany/i.test(skinText) ? "#865b46"
    : /tan|olive/i.test(skinText) ? "#b68260"
    : /pale|porcelain/i.test(skinText) ? "#ead0bd"
    : "#d5ad92";
  const iris = /blue|azure/i.test(eyeText) ? "#4c87c9"
    : /green|emerald/i.test(eyeText) ? "#45936e"
    : /gold|amber|yellow/i.test(eyeText) ? "#bd9037"
    : /red|crimson/i.test(eyeText) ? "#a94d59"
    : /purple|violet/i.test(eyeText) ? "#8564be"
    : /grey|gray|silver/i.test(eyeText) ? "#8797a7"
    : /brown|hazel/i.test(eyeText) ? "#704832" : "#25222b";
  const bodyType = traits?.bodyType ?? "average";
  const bodyWidth = bodyType === "stocky" ? 1.2 : bodyType === "athletic" ? 1.07 : bodyType === "slim" ? 0.88 : 1;
  const ageText = traits?.age?.toLocaleLowerCase() ?? "";
  const ageNumber = Number(ageText.match(/\b\d{1,3}\b/)?.[0] ?? NaN);
  const height = Number.isFinite(ageNumber) && ageNumber > 0
    ? ageNumber < 10 ? 0.72 : ageNumber < 14 ? 0.82 : ageNumber < 18 ? 0.92 : 1
    : /child|little kid|young child/i.test(ageText) ? 0.74 : /young teen/i.test(ageText) ? 0.88 : 1;
  const trousers = /light|white|cream/i.test(outfitText) ? "#d7d7d2" : "#292f42";
  const shoes = "#171b24";

  const head = addMesh(group,new THREE.SphereGeometry(.32,32,24),skin,[0,2.04,0],[.82,1.08,.78]);
  addMesh(group,new THREE.SphereGeometry(.335,32,24),hair,[0,shavedHair?2.2:2.245,-.035],[1.04, shavedHair ? 0.32 : longHair ? 0.66 : 0.52, .93]);
  addMesh(group,new THREE.SphereGeometry(.25,24,20),hair,[0,longHair?1.86:1.99,-.19],[longHair?1.2:1.15,longHair?1.55:1.1,.8]);
  addMesh(group,new THREE.CapsuleGeometry(.29,.57,5,12),clothes,[0,1.34,0],[1.02*bodyWidth,1,.75*bodyWidth]);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-.36*bodyWidth,1.6,0);
  leftArmPivot.rotation.z = -.17;
  group.add(leftArmPivot);
  addMesh(leftArmPivot,new THREE.CylinderGeometry(.105,.13,.62,16),skin,[0,-.25,0],[1,1,.85]);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(.36*bodyWidth,1.6,0);
  rightArmPivot.rotation.z = .17;
  group.add(rightArmPivot);
  addMesh(rightArmPivot,new THREE.CylinderGeometry(.105,.13,.62,16),skin,[0,-.25,0],[1,1,.85]);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-.16*bodyWidth,.93,0);
  leftLegPivot.rotation.z = -.02;
  group.add(leftLegPivot);
  addMesh(leftLegPivot,new THREE.CapsuleGeometry(.12,.62,5,12),trousers,[0,-.3,0],[1,1,.9]);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(.16*bodyWidth,.93,0);
  rightLegPivot.rotation.z = .02;
  group.add(rightLegPivot);
  addMesh(rightLegPivot,new THREE.CapsuleGeometry(.12,.62,5,12),trousers,[0,-.3,0],[1,1,.9]);

  addMesh(group,new THREE.SphereGeometry(.14,20,16),shoes,[-.17,.12,.045],[1,.62,1.55]);
  addMesh(group,new THREE.SphereGeometry(.14,20,16),shoes,[.17,.12,.045],[1,.62,1.55]);
  addMesh(group,new THREE.SphereGeometry(.035,16,12),"#f5e7d5",[-.095,2.055,.235],[1,1,.45]);
  addMesh(group,new THREE.SphereGeometry(.035,16,12),"#f5e7d5",[.095,2.055,.235],[1,1,.45]);
  addMesh(group,new THREE.SphereGeometry(.019,12,8),iris,[-.095,2.055,.257],[1,1,.45]);
  addMesh(group,new THREE.SphereGeometry(.019,12,8),iris,[.095,2.055,.257],[1,1,.45]);
  addMesh(group,new THREE.ConeGeometry(.04,.1,12),skin,[0,1.99,.255]);
  addMesh(group,new THREE.TorusGeometry(.09,.009,5,24,Math.PI), "#754e4b",[0,1.94,.235]);
  if (/scarf|cravat|tie/i.test(outfitText)) {
    addMesh(group,new THREE.TorusGeometry(.16,.045,8,28),clothes,[0,1.72,.02],[.9,.85,.85]);
  }
  group.scale.y = height;
  group.userData.proceduralRig = {
    head, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot,
    baseLeftArmZ: leftArmPivot.rotation.z, baseRightArmZ: rightArmPivot.rotation.z,
    baseLeftLegZ: leftLegPivot.rotation.z, baseRightLegZ: rightLegPivot.rotation.z,
  };
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

type PendingCharacterModelAction = { id: string; projectId: string; summary: string; commands: CharacterModelAgentCommand[] };
type CharacterModelStudioProps = {
  projectId: string;
  projects: ProjectChoice[];
  pendingAgentAction?: PendingCharacterModelAction | null;
  onAgentActionResult?: (id: string, result: "success" | "error", message: string) => void;
};
export default function CharacterModelStudio({ projectId, projects, pendingAgentAction = null, onAgentActionResult }: CharacterModelStudioProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rootRef = useRef<THREE.Group | null>(null);
  const modelContentRef = useRef<THREE.Group | null>(null);
  const animationMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const scarRootRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boundsRef = useRef(new THREE.Box3(new THREE.Vector3(-.5,0,-.3),new THREE.Vector3(.5,2.5,.3)));
  const [models, setModels] = useState<CharacterModelRecord[]>([]);
  const [modelsReady, setModelsReady] = useState(false);
  const [motionPreset, setMotionPreset] = useState<CharacterMotionPreset>("idle");
  const motionPresetRef = useRef<CharacterMotionPreset>("idle");
  const [animationClips, setAnimationClips] = useState<THREE.AnimationClip[]>([]);
  const [activeAnimationIndex, setActiveAnimationIndex] = useState("");
  const [styleBible, setStyleBible] = useState<ProjectStyleBible | null>(null);
  const [modelId, setModelId] = useState("");
  const [stateId, setStateId] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelRevision, setModelRevision] = useState(0);
  const [message, setMessage] = useState("Upload a GLB character model or create a 3D blockout. Approved chapter states determine which scars should be visible.");
  const [frontFace, setFrontFace] = useState<"positive-z"|"negative-z">("positive-z");
  const [agentActionProgress, setAgentActionProgress] = useState<{ id: string; completed: number; total: number; command: string } | null>(null);
  const handledAgentActionRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setModelsReady(false);
    if (!projectId) { setModels([]); setStyleBible(null); setModelId(""); setStateId(""); setModelsReady(true); return; }
    setBusy(true);
    void Promise.all([characterModelStorage.list(projectId), styleBibleStorage.load(projectId)]).then(([loadedModels,bible]) => {
      if (!alive) return;
      setModels(loadedModels); setStyleBible(bible ?? null); setModelsReady(true);
      setModelId(current => loadedModels.some(model => model.id === current) ? current : loadedModels[0]?.id ?? "");
      setMessage("Loaded " + loadedModels.length + " saved character model" + (loadedModels.length === 1 ? "" : "s") + " for this project.");
    }).catch(error => { if (alive) { setMessage(error instanceof Error ? error.message : "Could not load character models."); setModelsReady(true); } })
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
    return selectCharacterModelVariant(models, selectedProfile.characterName, selectedState?.storyOrder);
  }, [models, selectedProfile, selectedState]);
  const resolved = selectedProfile && selectedState && styleBible
    ? resolveCharacterVisualState(styleBible.characterStates, selectedProfile.characterName, selectedState.storyOrder) : undefined;
  const scarsAbsent = scarsAreAbsent(resolved?.traits.scars);
  const activeScars = selectedModel && selectedState && styleBible
    ? resolveActiveScarOverlays(selectedModel.scarOverlays, styleBible.characterStates, selectedModel.characterName, selectedState.storyOrder, resolved?.traits.scars)
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
    const modelContent = new THREE.Group(); root.add(modelContent);
    const scarRoot = new THREE.Group(); root.add(scarRoot);
    const controls = new OrbitControls(camera,renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor=.08; controls.minDistance=2.1; controls.maxDistance=11;
    controls.target.set(0,1.25,0); controls.update();
    sceneRef.current=scene; rootRef.current=root; modelContentRef.current=modelContent; scarRootRef.current=scarRoot; rendererRef.current=renderer; cameraRef.current=camera; controlsRef.current=controls;
    let frame=0;
    const clock = new THREE.Clock();
    const animate=()=>{
      frame=window.requestAnimationFrame(animate);
      const delta=Math.min(clock.getDelta(),0.05);
      const elapsed=clock.elapsedTime;
      animationMixerRef.current?.update(delta);
      // Gentle preview motion is native Three.js animation, never a generated video.
      root.position.y=Math.sin(elapsed*2.1)*0.009;
      if(!animationMixerRef.current){
        const rigObject=modelContent.children.find(child=>child.userData.proceduralRig);
        const rig=rigObject?.userData.proceduralRig as {
          head:THREE.Mesh;leftArmPivot:THREE.Group;rightArmPivot:THREE.Group;
          leftLegPivot:THREE.Group;rightLegPivot:THREE.Group;
          baseLeftArmZ:number;baseRightArmZ:number;baseLeftLegZ:number;baseRightLegZ:number;
        }|undefined;
        if(rig){
          const preset=motionPresetRef.current;
          const breathing=Math.sin(elapsed*1.65)*0.018;
          if(preset==="flex"){
            rig.leftArmPivot.rotation.z=-1.02+breathing;
            rig.rightArmPivot.rotation.z=1.02-breathing;
            rig.leftArmPivot.rotation.x=-0.28;rig.rightArmPivot.rotation.x=-0.28;
            rig.leftLegPivot.rotation.z=rig.baseLeftLegZ;rig.rightLegPivot.rotation.z=rig.baseRightLegZ;
          }else if(preset==="combat-ready"){
            rig.leftArmPivot.rotation.z=-0.48+breathing;
            rig.rightArmPivot.rotation.z=0.48-breathing;
            rig.leftArmPivot.rotation.x=-0.72;rig.rightArmPivot.rotation.x=-0.72;
            rig.leftLegPivot.rotation.z=rig.baseLeftLegZ-0.1;
            rig.rightLegPivot.rotation.z=rig.baseRightLegZ+0.1;
          }else{
            const movement=preset==="relaxed"?0:Math.sin(elapsed*1.25)*0.024;
            rig.leftArmPivot.rotation.z=rig.baseLeftArmZ+movement+breathing;
            rig.rightArmPivot.rotation.z=rig.baseRightArmZ-movement-breathing;
            rig.leftArmPivot.rotation.x=Math.sin(elapsed*0.8)*0.012;
            rig.rightArmPivot.rotation.x=-Math.sin(elapsed*0.8)*0.012;
            rig.leftLegPivot.rotation.z=rig.baseLeftLegZ+Math.sin(elapsed*0.9)*0.012;
            rig.rightLegPivot.rotation.z=rig.baseRightLegZ-Math.sin(elapsed*0.9)*0.012;
          }
          rig.head.rotation.y=preset==="idle"?Math.sin(elapsed*0.45)*0.035:0;
        }
      }
      controls.update();renderer.render(scene,camera);
    };
    animate();
    const resize=()=>{if(!hostRef.current)return;const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);};
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    observer?.observe(host);window.addEventListener("resize",resize);
    return ()=>{window.cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener("resize",resize);controls.dispose();animationMixerRef.current?.stopAllAction();animationMixerRef.current=null;clearGroup(root);clearGroup(scarRoot);renderer.dispose();if(renderer.domElement.parentNode===host)host.removeChild(renderer.domElement);sceneRef.current=null;rootRef.current=null;modelContentRef.current=null;scarRootRef.current=null;rendererRef.current=null;cameraRef.current=null;controlsRef.current=null;};
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
        catch (error) { createProceduralCharacter(inner, resolved?.traits); finish(error instanceof Error ? error.message + " Showing a blockout instead." : "Invalid model. Showing a blockout instead."); }
      }, undefined, () => {
        if (cancelled) return;
        createProceduralCharacter(inner, resolved?.traits); finish("The GLB could not be loaded. Showing the procedural blockout; try a self-contained GLB.");
      });
    } else {
      createProceduralCharacter(inner, resolved?.traits);
      finish(selectedModel ? "Showing the procedural 3D blockout for " + selectedModel.characterName + ". Hair silhouette and outfit colors reflect approved notes where recognizable; upload a GLB for a finished sculpt." : selectedProfile && selectedState ? "No model variant exists at " + selectedState.chapterLabel + ". Showing a blockout; upload a GLB while this chapter is selected to add a chapter-specific model." : "Create a character blockout or upload a GLB model to begin.");
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selectedModel?.id, selectedModel?.sourceType, selectedModel?.modelBlob, selectedProfile?.id, selectedState?.id, selectedModel?.sourceType === "procedural" ? resolved?.traits.hair : undefined, selectedModel?.sourceType === "procedural" ? resolved?.traits.outfit : undefined]);

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

  async function refreshVisualCanon() {
    if (!projectId) return;
    setBusy(true);
    try {
      const [loadedModels, bible] = await Promise.all([characterModelStorage.list(projectId), styleBibleStorage.load(projectId)]);
      setModels(loadedModels); setStyleBible(bible ?? null);
      setModelId(current => loadedModels.some(model => model.id === current) ? current : loadedModels[0]?.id ?? "");
      setMessage("Refreshed character models and approved visual timeline.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not refresh visual canon."); }
    finally { setBusy(false); }
  }

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
  async function removeScarMarker(scar: ScarOverlay) {
    if (!selectedModel) return;
    if (selectedState && selectedState.storyOrder > scar.introducedAtOrder) {
      await updateScar(scar.id,{removedAtOrder:selectedState.storyOrder});
    } else {
      await persistModel({...selectedModel,scarOverlays:selectedModel.scarOverlays.filter(item=>item.id!==scar.id)},"Removed the mistaken scar marker from the model history.",true);
    }
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
  async function animateCameraTo(position: THREE.Vector3, target: THREE.Vector3) {
    const camera = cameraRef.current, controls = controlsRef.current;
    if (!camera || !controls) throw new Error("The live 3D viewport is not ready yet.");
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const startedAt = performance.now();
    const wasEnabled = controls.enabled;
    controls.enabled = false;
    await new Promise<void>(resolve => {
      const tick = (now: number) => {
        if (cameraRef.current !== camera || controlsRef.current !== controls) { resolve(); return; }
        const progress = Math.min(1, (now - startedAt) / 320);
        const eased = progress * progress * (3 - 2 * progress);
        camera.position.lerpVectors(fromPosition, position, eased);
        controls.target.lerpVectors(fromTarget, target, eased);
        controls.update();
        if (progress < 1) requestAnimationFrame(tick);
        else { controls.enabled = wasEnabled; resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  async function applyCameraPreset(preset: CharacterCameraPreset) {
    const pose = CAMERA_PRESETS[preset];
    if (!pose) throw new Error("Unknown 3D camera preset.");
    await animateCameraTo(new THREE.Vector3(...pose.position), new THREE.Vector3(...pose.target));
    setMessage("Kuro moved the live camera to the " + preset.replace(/-/g, " ") + " view. The model geometry was not changed.");
  }

  async function animateModelRotation(degrees?: number, reset = false) {
    const root = rootRef.current;
    if (!root) throw new Error("The character preview is not ready yet.");
    const from = root.rotation.y;
    const to = reset ? 0 : from + (degrees ?? 0) * Math.PI / 180;
    const startedAt = performance.now();
    await new Promise<void>(resolve => {
      const tick = (now: number) => {
        if (rootRef.current !== root) { resolve(); return; }
        const progress = Math.min(1, (now - startedAt) / 260);
        const eased = progress * progress * (3 - 2 * progress);
        root.rotation.y = from + (to - from) * eased;
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    setMessage(reset ? "Reset the displayed model orientation. The source model was not edited."
      : "Rotated the displayed model by " + degrees + "°. This is a non-destructive viewport action.");
  }

  async function executeAgentCommand(command: CharacterModelAgentCommand) {
    switch (command.type) {
      case "camera.preset":
        await applyCameraPreset(command.preset);
        return;
      case "camera.zoom": {
        const camera = cameraRef.current, controls = controlsRef.current;
        if (!camera || !controls) throw new Error("The live 3D viewport is not ready yet.");
        const direction = camera.position.clone().sub(controls.target);
        const distance = THREE.MathUtils.clamp(direction.length() / command.factor, controls.minDistance, controls.maxDistance);
        direction.setLength(distance);
        await animateCameraTo(controls.target.clone().add(direction), controls.target.clone());
        setMessage((command.factor >= 1 ? "Zoomed in " : "Zoomed out ") + Math.round(Math.abs(command.factor - 1) * 100) + "%. Camera movement only; model geometry was not changed.");
        return;
      }
      case "model.rotateView":
        await animateModelRotation(command.degrees);
        return;
      case "model.resetViewRotation":
        await animateModelRotation(undefined, true);
        return;
    }
  }

  useEffect(() => {
    const action = pendingAgentAction;
    if (!action || action.projectId !== projectId || !onAgentActionResult || handledAgentActionRef.current === action.id) return;
    handledAgentActionRef.current = action.id;
    let cancelled = false;
    const run = async () => {
      setAgentActionProgress({ id: action.id, completed: 0, total: action.commands.length, command: action.summary });
      setMessage("Kuro is operating the live 3D viewport tools.");
      try {
        for (let index = 0; index < action.commands.length; index++) {
          if (cancelled) return;
          const command = action.commands[index];
          setAgentActionProgress({ id: action.id, completed: index, total: action.commands.length, command: describeCharacterModelAgentCommand(command) });
          await executeAgentCommand(command);
          if (cancelled) return;
          setAgentActionProgress({ id: action.id, completed: index + 1, total: action.commands.length, command: describeCharacterModelAgentCommand(command) });
        }
        if (cancelled) return;
        const completed = action.commands.map(describeCharacterModelAgentCommand).join("; ");
        setAgentActionProgress(null);
        setMessage("Completed " + action.commands.length + " native 3D viewport action(s). No image was generated and no source mesh was overwritten.");
        onAgentActionResult(action.id, "success", completed);
      } catch (error) {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : "Unknown viewport-tool failure.";
        setAgentActionProgress(null);
        setMessage("The 3D agent action failed: " + reason);
        onAgentActionResult(action.id, "error", reason);
      }
    };
    void run();
    return () => { cancelled = true; };
  // The action ID is the idempotency key: changing parent callbacks or progress state must not replay it.
  }, [pendingAgentAction?.id]);

  async function resetView() {
    await applyCameraPreset("front");
    await animateModelRotation(undefined, true);
    setMessage("View centered and model orientation reset. Drag to orbit and scroll to zoom.");
  }

  const stateOptions: CharacterVisualState[] = statesForCharacter;
  const hasTextScar = !!resolved?.traits.scars && !scarsAbsent;
  const activeProject = projects.find(project => project.id === projectId);
  return <section className="character-model-studio">
    <header className="character-model-head"><div><small>3D CHARACTER WORKSPACE · CHAPTER-AWARE</small><h2><Box size={20}/> Character model studio</h2><p>Attach a GLB model, choose an approved chapter state, and place scar overlays that appear only from their introduction onward.</p><small className="character-model-project-name">{activeProject?.name ?? "No active project"}</small></div><button className="character-model-refresh" disabled={!projectId || busy} onClick={() => void refreshVisualCanon()}><RefreshCw size={14}/> Refresh timeline</button></header>
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
        <button disabled={!selectedModel} onClick={()=>void resetView()}><RotateCcw size={14}/> Reset view</button><button type="button" onClick={()=>void applyCameraPreset("front")}>Front</button><button type="button" onClick={()=>void applyCameraPreset("three-quarter-right")}>3/4 view</button><button type="button" onClick={()=>void applyCameraPreset("profile-left")}>Profile</button><button type="button" onClick={()=>void applyCameraPreset("back")}>Back</button><button type="button" onClick={()=>void applyCameraPreset("full-body")}>Full body</button>
      </div>
      <p className="character-model-message" role="status">{message}</p>
      <div className="character-model-layout">
        <div className="character-model-viewer">
          <div ref={hostRef} className="character-model-canvas" />
          <div className="character-model-viewer-hint">Drag to orbit · scroll to zoom · touch supported</div>{agentActionProgress && <div className="character-model-viewer-hint" role="status" aria-live="polite">Kuro using native 3D tools · {agentActionProgress.completed}/{agentActionProgress.total} · {agentActionProgress.command}<progress value={agentActionProgress.completed} max={Math.max(1,agentActionProgress.total)} aria-label="3D tool progress"/></div>}
          {selectedModel && (
            <div className="character-model-viewer-label">
              <b>{selectedModel.characterName}</b>
              <span>{selectedState?.chapterLabel ?? "No approved visual state"}</span>
            </div>
          )}
        </div>
        <aside className="character-model-inspector">
          <h3>Visual continuity</h3>
          {selectedModel ? <><div className="character-model-meta"><b>{selectedModel.sourceType==="uploaded-glb" ? selectedModel.fileName : "Procedural blockout rig"}</b><small>{selectedModel.sourceType==="uploaded-glb" ? "Local GLB · editable model view" : "Preview geometry · not final character art"}</small><small>Variant: {selectedModel.characterStateId ? styleBible?.characterStates.find(state=>state.id===selectedModel.characterStateId)?.chapterLabel ?? "chapter-specific" : "base model"}</small></div>
            {!selectedState && <div className="character-model-warning"><ShieldAlert size={15}/><p>No approved visual state matches this character. Add a state in Style Bible and approve it before using it as canon.</p></div>}
            {selectedState && <div className="character-model-state"><small>APPROVED STATE</small><b>{selectedState.chapterLabel}</b><span>Story order {selectedState.storyOrder} · {resolved?.traits.age || "Age unknown"}</span><p>Hair: {resolved?.traits.hair || "Unknown"}</p><p>Scars: {resolved?.traits.scars || "Unknown"}</p><p>Outfit: {resolved?.traits.outfit || "Unknown"}</p></div>}
            {selectedState && hasTextScar && activeScars.length===0 && <div className="character-model-warning"><ShieldAlert size={15}/><p>A scar is recorded in the timeline, but no 3D overlay is placed yet. Add a scar marker and adjust it to match the model.</p></div>}
            {selectedState && hasTextScar && <button className="character-model-primary" disabled={busy} onClick={()=>void addScar()}><Plus size={14}/> Add scar overlay</button>}
            {selectedState && scarsAbsent && selectedModel.scarOverlays.some(scar=>scar.introducedAtOrder<selectedState.storyOrder) && <button className="character-model-secondary" disabled={busy} onClick={()=>void recordScarRemoval()}>Record scar removal at this chapter</button>}
            <div className="character-model-scar-list">{activeScars.map(scar=><article key={scar.id}><header><b>{scar.label}</b><button aria-label="Remove scar marker" onClick={()=>void removeScarMarker(scar)}><Trash2 size={13}/></button></header>
              {([["x","Horizontal position",-0.5,0.5,scar.x],["y","Vertical position",-0.5,0.5,scar.y],["z","Surface depth",0,0.5,Math.abs(scar.z)],["length","Length",0.01,0.25,scar.length],["angle","Angle",-180,180,scar.angle]] as Array<[keyof ScarOverlay,string,number,number,number]>).map(([key,label,min,max,value])=><label key={key}><span>{label}<small>{Number(value).toFixed(2)}</small></span><input type="range" min={min} max={max} step={key==="angle"?1:0.01} value={value} onChange={event=>void updateScar(scar.id,{[key]:Number(event.target.value)} as Partial<ScarOverlay>)}/></label>)}
              <label><span>Scar color</span><input type="color" value={scar.color} onChange={event=>void updateScar(scar.id,{color:event.target.value})}/></label>
            </article>)}</div>
            <button className="character-model-remove" disabled={busy} onClick={()=>void removeModel()}><Trash2 size={13}/> Remove model</button>
          </> : selectedProfile && selectedState ? <p className="character-model-empty">No model variant is saved for {selectedState.chapterLabel}. The viewer shows a blockout for this earlier/later state; upload a GLB now to make the character's visual progression concrete.</p> : <p className="character-model-empty">Create a blockout or upload a GLB model to begin.</p>}
        </aside>
      </div>
      <p className="character-model-footnote">The model preview does not generate a finished anime sculpt. GLB files stay local to this browser and are included in project export when supported. Scar markers are editable overlays, not permanent edits to the source mesh.</p>
    </>}
  </section>;
}
