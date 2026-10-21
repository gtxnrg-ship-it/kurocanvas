import { useEffect, useMemo, useState } from "react";
import "./worldStudio.css";
import { AlertTriangle, BookOpen, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { createEmptyCanon, retrieveCanon, validateCanon, type CanonBundle, type CanonEntity, type CanonFact, type CanonStatus } from "./universe";
import { canonStorage, projectStorage } from "../core/storage";

type Project = { id: string; name: string };
const statuses: CanonStatus[] = ["approved", "proposed", "inferred", "contradicted", "superseded"];
const kinds = ["character", "location", "faction", "event", "object", "rule", "species", "other"];
const makeId = () => crypto.randomUUID();

type WorldStudioProps = { projectId?: string; lockedToProjectId?: boolean };

export default function WorldStudio({ projectId: externalProjectId, lockedToProjectId = false }: WorldStudioProps = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  // Embedded in a universe, the parent owns project selection: the bible may never
  // silently switch to another project's canon. Standalone mode keeps the old picker.
  const projectId = externalProjectId ?? selectedProjectId;
  const [bundle, setBundle] = useState<CanonBundle | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("character");
  const [aliases, setAliases] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [predicate, setPredicate] = useState("");
  const [value, setValue] = useState("");
  const [storyOrder, setStoryOrder] = useState("");
  const [status, setStatus] = useState<CanonStatus>("proposed");
  const [message, setMessage] = useState("World facts are saved locally per project. New records start as proposed.");
  const [busy, setBusy] = useState(false);

  async function refreshProjects() {
    try {
      const list = await projectStorage.list();
      setProjects(list);
      if (!projectId && externalProjectId === undefined && list.length) setSelectedProjectId(list[0].id);
      if (projectId && !list.some(p => p.id === projectId) && externalProjectId === undefined) { setSelectedProjectId(""); setBundle(null); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load projects."); }
  }
  async function loadWorld(id: string) {
    if (!id) { setBundle(null); return; }
    setBusy(true);
    try {
      const saved = await canonStorage.load(id);
      const next = saved ?? createEmptyCanon(id);
      setBundle(next);
      setSubjectId(current => next.entities.some(e => e.id === current) ? current : (next.entities[0]?.id ?? ""));
      setMessage(saved ? "Loaded saved world bible." : "This project has no world facts yet. Add a character, place, or canon rule to begin.");
    } catch (error) { setBundle(null); setMessage(error instanceof Error ? error.message : "Could not load world bible."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refreshProjects(); }, []);
  useEffect(() => { void loadWorld(projectId); }, [projectId]);

  const issues = useMemo(() => bundle ? validateCanon(bundle) : [], [bundle]);
  const results = useMemo(() => {
    if (!bundle) return { entities: [] as CanonEntity[], facts: [] as CanonFact[] };
    const query = search.trim().toLocaleLowerCase();
    const retrieved = retrieveCanon(bundle, { projectId: bundle.projectId, text: search, limit: 150 });
    if (!query) return retrieved;
    const matchingFacts = bundle.facts.filter(f => {
      const subject = bundle.entities.find(e => e.id === f.subjectId);
      return (f.predicate + " " + (typeof f.value === "string" ? f.value : JSON.stringify(f.value)) + " " + (subject?.name ?? "")).toLocaleLowerCase().includes(query);
    });
    const entityIds = new Set([...retrieved.entities.map(e => e.id), ...matchingFacts.map(f => f.subjectId)]);
    const facts = new Map([...retrieved.facts, ...matchingFacts].map(f => [f.id, f]));
    return { entities: bundle.entities.filter(e => entityIds.has(e.id)).slice(0, 150), facts: [...facts.values()].slice(0, 150) };
  }, [bundle, search]);
  const entitiesById = useMemo(() => new Map((bundle?.entities ?? []).map(e => [e.id, e])), [bundle]);

  async function persist(next: CanonBundle, success: string) {
    setBusy(true);
    try {
      await canonStorage.save(next);
      setBundle(next);
      setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save world bible."); }
    finally { setBusy(false); }
  }
  async function addEntity() {
    if (!bundle || !name.trim()) { setMessage("Give the record a name first."); return; }
    const entity: CanonEntity = { id: makeId(), projectId: bundle.projectId, kind, name: name.trim(), aliases: aliases.split(",").map(s => s.trim()).filter(Boolean), status };
    const next = { ...bundle, entities: [...bundle.entities, entity] };
    if (validateCanon(next).some(i => i.severity === "error")) { setMessage("This record failed validation and was not saved."); return; }
    setName(""); setAliases(""); setSubjectId(entity.id);
    await persist(next, "Added “" + entity.name + "” to the world bible.");
  }
  async function addFact() {
    if (!bundle || !subjectId || !predicate.trim() || !value.trim()) { setMessage("Choose a subject and fill in the fact, then save."); return; }
    let parsed: unknown = value.trim();
    try { parsed = JSON.parse(value); } catch { /* plain text is a valid canon value */ }
    const fact: CanonFact = { id: makeId(), projectId: bundle.projectId, subjectId, predicate: predicate.trim(), value: parsed, status, ...(storyOrder.trim() && Number.isFinite(Number(storyOrder)) ? { storyOrder: Number(storyOrder) } : {}) };
    const next = { ...bundle, facts: [...bundle.facts, fact] };
    if (validateCanon(next).some(i => i.severity === "error")) { setMessage("This fact failed validation and was not saved."); return; }
    setPredicate(""); setValue(""); setStoryOrder("");
    await persist(next, "Saved a " + status + " fact. It is not automatically promoted to approved canon.");
  }
  async function changeStatus(id: string, nextStatus: CanonStatus) {
    if (!bundle) return;
    const next = { ...bundle, entities: bundle.entities.map(e => e.id === id ? { ...e, status: nextStatus } : e), facts: bundle.facts.map(f => f.id === id ? { ...f, status: nextStatus } : f) };
    await persist(next, "Updated record status to " + nextStatus + ".");
  }

  return <section className="world-studio">
    <div className="world-head"><div><small>PROJECT MEMORY · LOCAL FIRST</small><h2><BookOpen size={21}/> World bible</h2><p>Keep characters, places, events, and rules attached to the correct series. Proposed facts never silently become approved canon.</p></div><button disabled={busy} onClick={() => void refreshProjects()}><RefreshCw size={14}/> Refresh projects</button></div>
    <label className="world-project">{lockedToProjectId ? "Universe-owned project" : "Active project"} <select value={projectId} disabled={lockedToProjectId} onChange={e => setSelectedProjectId(e.target.value)}><option value="">Choose a saved project…</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {!projects.length && <p className="world-empty">Create a project in the section below first. World memory is intentionally scoped to a saved project.</p>}
    {bundle && <>
      <p className="world-message" role="status">{message}</p>
      <div className="world-stats"><span><b>{bundle.entities.length}</b> entities</span><span><b>{bundle.facts.length}</b> facts</span><span><b>{issues.filter(i=>i.severity==="warning").length}</b> warnings</span></div>
      <div className="world-grid">
        <div className="world-card"><h3><Plus size={16}/> Add an entity</h3><p>Characters, locations, factions, objects, events, and world rules.</p>
          <label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Mira Vale"/></label>
          <div className="world-fields"><label>Type<select value={kind} onChange={e=>setKind(e.target.value)}>{kinds.map(k=><option key={k} value={k}>{k}</option>)}</select></label><label>Initial status<select value={status} onChange={e=>setStatus(e.target.value as CanonStatus)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>
          <label>Aliases <span>(comma separated)</span><input value={aliases} onChange={e=>setAliases(e.target.value)} placeholder="Mira, The Ash Knight"/></label>
          <button className="world-primary" disabled={busy || !name.trim()} onClick={()=>void addEntity()}>Save entity</button>
        </div>
        <div className="world-card"><h3><Plus size={16}/> Add a fact</h3><p>Attach a fact to an existing entity. Optional story order helps represent when it becomes true.</p>
          <label>Subject<select value={subjectId} onChange={e=>setSubjectId(e.target.value)}><option value="">Choose entity…</option>{bundle.entities.map(e=><option key={e.id} value={e.id}>{e.name} · {e.kind}</option>)}</select></label>
          <label>Fact / predicate<input value={predicate} onChange={e=>setPredicate(e.target.value)} placeholder="e.g. eye_colour or secret_identity"/></label>
          <label>Value<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Plain text or JSON value"/></label>
          <div className="world-fields"><label>Story order <span>(optional number)</span><input value={storyOrder} onChange={e=>setStoryOrder(e.target.value)} inputMode="numeric" placeholder="e.g. 12"/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value as CanonStatus)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>
          <button className="world-primary" disabled={busy || !subjectId || !predicate.trim() || !value.trim()} onClick={()=>void addFact()}>Save fact</button>
        </div>
      </div>
      <label className="world-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search names, aliases, and facts…"/></label>
      {issues.length>0 && <div className="world-issues"><h3><AlertTriangle size={16}/> Validation review</h3>{issues.map((issue,i)=><p key={issue.code+issue.recordIds.join("-")+i}><b>{issue.severity}</b> · {issue.message}</p>)}</div>}
      <div className="world-records"><h3>Entities</h3>{results.entities.length===0?<p className="world-empty">No matching entities yet.</p>:results.entities.map(entity=><article className="world-record" key={entity.id}><div><b>{entity.name}</b><small>{entity.kind}{entity.aliases.length ? " · also known as "+entity.aliases.join(", ") : ""}</small><p>{results.facts.filter(f=>f.subjectId===entity.id).map(f=>f.predicate+": "+(typeof f.value==="string"?f.value:JSON.stringify(f.value))+" · "+f.status).join("  /  ") || "No facts recorded yet."}</p></div><select aria-label={"Status for "+entity.name} value={entity.status} disabled={busy} onChange={e=>void changeStatus(entity.id,e.target.value as CanonStatus)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></article>)}</div>
      <div className="world-records"><h3>Facts</h3>{results.facts.length===0?<p className="world-empty">No matching facts yet.</p>:results.facts.map(f=><article className="world-record" key={f.id}><div><b>{entitiesById.get(f.subjectId)?.name ?? "Unknown subject"} · {f.predicate}</b><small>Story order: {f.storyOrder ?? "unspecified"} · {f.status}</small><p>{typeof f.value==="string"?f.value:JSON.stringify(f.value)}</p></div><select aria-label={"Status for fact "+f.predicate} disabled={busy} value={f.status} onChange={e=>void changeStatus(f.id,e.target.value as CanonStatus)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></article>)}</div>
      <p className="world-foot"><ShieldCheck size={14}/> Saved in this browser's IndexedDB. Retrieval is currently lexical; warnings flag possible conflicts and do not decide which version is true for you.</p>
    </>}
  </section>;
}
