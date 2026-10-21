import { useEffect, useState } from "react";
import { Palette, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { artDirectionStorage } from "../core/storage";
import { ART_DIRECTION_FIELDS, createEmptyArtDirection, type ArtDirectionBible, type ArtDirectionField, type ArtDirectionInfluence } from "./artDirection";
import "./artDirectionStudio.css";

type ProjectChoice = { id: string; name: string };
const makeId = () => crypto.randomUUID();

export default function ArtDirectionStudio({ projectId, projects }: { projectId: string; projects: ProjectChoice[] }) {
  const [bible, setBible] = useState<ArtDirectionBible | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose a project to define its consistent story and visual language.");

  useEffect(() => {
    let alive = true;
    if (!projectId) { setBible(null); setMessage("Choose a project first. Art direction is stored separately for each series."); return; }
    setBusy(true);
    void artDirectionStorage.load(projectId).then(saved => {
      if (!alive) return;
      setBible(saved ?? createEmptyArtDirection(projectId));
      setMessage(saved ? "Loaded saved art direction. Locked rules are attached to Kuro's project context." : "No art direction saved yet. Set the style once, then keep it consistent across chapters.");
    }).catch(error => { if (alive) { setBible(null); setMessage(error instanceof Error ? error.message : "Could not load art direction."); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [projectId]);

  function updateField(key: ArtDirectionField, value: string) {
    setBible(current => current ? { ...current, [key]: value } : current);
  }
  function updateInfluence(id: string, key: keyof Omit<ArtDirectionInfluence, "id">, value: string) {
    setBible(current => current ? { ...current, influences: current.influences.map(item => item.id === id ? { ...item, [key]: value } : item) } : current);
  }
  async function save() {
    if (!bible || !projectId) return;
    setBusy(true);
    try {
      const next = { ...bible, projectId, updatedAt: new Date().toISOString() };
      await artDirectionStorage.save(next);
      setBible(next);
      setMessage("Art direction saved. Kuro will receive these constraints for story and drawing requests in this project.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save art direction."); }
    finally { setBusy(false); }
  }

  const activeProject = projects.find(project => project.id === projectId);
  return <section className="art-direction-studio">
    <header className="art-direction-head">
      <div><small>STYLE DNA · PROJECT-LOCKED</small><h2><Palette size={20}/> Art direction bible</h2>
        <p>Blend story, relationship, ensemble, and visual inspirations into one original style. Kuro receives these rules alongside approved canon and chapter history.</p></div>
      <button className="art-direction-save" disabled={!bible || !projectId || busy} onClick={() => void save()}><Save size={15}/>{busy ? "Saving…" : "Save art direction"}</button>
    </header>
    {!projectId ? <p className="art-direction-message">{message}</p> : <>
      <div className="art-direction-project"><ShieldCheck size={15}/><span><b>{activeProject?.name ?? "Active project"}</b><small>Separate style memory · no cross-project mixing</small></span></div>
      <p className="art-direction-message" role="status">{message}</p>
      {bible && <div className="art-direction-fields">{ART_DIRECTION_FIELDS.map(field => <label key={field.key} className={field.key === "title" || field.key === "premise" || field.key === "visualStyle" || field.key === "visualInvariants" ? "art-direction-wide" : ""}>
        <span>{field.label}</span><small>{field.hint}</small>
        {field.key === "title" ? <input value={bible[field.key]} onChange={event => updateField(field.key, event.target.value)} placeholder="e.g. Neon Hearts, Lasting Scars"/> :
          <textarea value={bible[field.key]} onChange={event => updateField(field.key, event.target.value)} rows={field.key === "premise" || field.key === "visualStyle" || field.key === "visualInvariants" || field.key === "avoid" ? 4 : 3} placeholder={"Define " + field.label.toLowerCase() + "…"} />}
      </label>)}</div>}
      {bible && <section className="art-direction-influences">
        <div className="art-direction-subhead"><div><h3>Inspiration map</h3><p>Give each reference one job. The combined result becomes your project's own style, not a copy of any one work.</p></div>
          <button onClick={() => setBible(current => current ? { ...current, influences: [...current.influences, { id: makeId(), work: "", aspect: "", notes: "" }] } : current)}><Plus size={14}/> Add influence</button></div>
        {!bible.influences.length && <p className="art-direction-empty">No inspirations added. Add separate entries for relationship dynamics, comedy rhythm, group chemistry, linework, color, or rendering.</p>}
        {bible.influences.map((item, index) => <div className="art-direction-influence" key={item.id}>
          <div className="art-direction-influence-title"><b>Reference {index + 1}</b><button aria-label={"Remove reference " + (index + 1)} onClick={() => setBible(current => current ? { ...current, influences: current.influences.filter(candidate => candidate.id !== item.id) } : current)}><Trash2 size={14}/></button></div>
          <label><span>Work or reference</span><input value={item.work} onChange={event => updateInfluence(item.id, "work", event.target.value)} placeholder="Title of a series, film, book, or visual reference"/></label>
          <label><span>Only the dimension to borrow</span><input value={item.aspect} onChange={event => updateInfluence(item.id, "aspect", event.target.value)} placeholder="e.g. English-dub banter and relationship pacing"/></label>
          <label><span>What works about it</span><textarea rows={2} value={item.notes} onChange={event => updateInfluence(item.id, "notes", event.target.value)} placeholder="Describe broad qualities; avoid copying exact characters or scenes."/></label>
        </div>)}
      </section>}
      <p className="art-direction-footnote">Continuity rule: a scar, haircut, age, outfit, or other lasting design change should carry forward only when the approved timeline supports it. Missing details remain unknown rather than being invented.</p>
    </>}
  </section>;
}
