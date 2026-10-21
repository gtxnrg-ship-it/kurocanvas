import { useEffect, useState } from "react";
import { Check, Plus, Save, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { styleBibleStorage } from "../core/storage";
import { createEmptyStyleBible, findStyleConflicts, type ProjectStyleBible, type StyleInspiration, type StyleRule, type CharacterVisualState, type StyleRecordStatus } from "./styleBible";
import "./styleBibleStudio.css";

type ProjectChoice = { id: string; name: string };
const makeId = () => crypto.randomUUID();
const statusOptions: StyleRecordStatus[] = ["proposed", "approved", "superseded"];
const aspectOptions = ["relationship-comedy", "linework", "rendering", "palette", "lighting", "group-dynamics", "dialogue", "proportions", "other"];

export default function StyleBibleStudio({ projectId, projects }: { projectId: string; projects: ProjectChoice[] }) {
  const [bible, setBible] = useState<ProjectStyleBible | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Character appearance is time-dependent: future changes must never leak into earlier chapters.");

  useEffect(() => {
    let alive = true;
    if (!projectId) { setBible(null); setMessage("Choose a project to define approved visual states and source inspirations."); return; }
    setBusy(true);
    void styleBibleStorage.load(projectId).then(saved => {
      if (!alive) return;
      setBible(saved ?? createEmptyStyleBible(projectId));
      setMessage(saved ? "Loaded chapter-aware style bible." : "Create the project's unified style and approve character states as they become canon.");
    }).catch(error => { if (alive) { setBible(null); setMessage(error instanceof Error ? error.message : "Could not load style bible."); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [projectId]);

  function update<K extends "title" | "styleSummary">(key: K, value: ProjectStyleBible[K]) {
    setBible(current => current ? { ...current, [key]: value } : current);
  }
  function updateInspiration(id: string, patch: Partial<StyleInspiration>) {
    setBible(current => current ? { ...current, inspirations: current.inspirations.map(item => item.id === id ? { ...item, ...patch } : item) } : current);
  }
  function updateRule(id: string, patch: Partial<StyleRule>) {
    setBible(current => current ? { ...current, rules: current.rules.map(item => item.id === id ? { ...item, ...patch } : item) } : current);
  }
  function updateState(id: string, patch: Partial<CharacterVisualState>) {
    setBible(current => current ? { ...current, characterStates: current.characterStates.map(item => item.id === id ? { ...item, ...patch } : item) } : current);
  }
  async function save() {
    if (!bible || !projectId) return;
    setBusy(true);
    try {
      const next = { ...bible, projectId, updatedAt: new Date().toISOString() };
      await styleBibleStorage.save(next);
      setBible(next);
      setMessage("Saved. Only approved inspirations, rules, and character states are used as established visual canon.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save style bible."); }
    finally { setBusy(false); }
  }
  const conflicts = bible ? findStyleConflicts(bible) : [];
  const activeProject = projects.find(project => project.id === projectId);

  return <section className="style-bible-studio">
    <header className="style-bible-head"><div><small>VISUAL CANON · CHAPTER-AWARE</small><h2><ShieldCheck size={20}/> Style bible & character timeline</h2>
      <p>Lock the original style, separate each inspiration by purpose, and record exactly how a character changes over time.</p></div>
      <button disabled={!bible || !projectId || busy} onClick={() => void save()}><Save size={15}/>{busy ? "Saving…" : "Save visual canon"}</button>
    </header>
    {!projectId ? <p className="style-bible-message">{message}</p> : <>
      <div className="style-bible-project"><b>{activeProject?.name ?? "Active project"}</b><span>isolated visual canon</span></div>
      <p className="style-bible-message" role="status">{message}</p>
      {conflicts.length > 0 && <div className="style-bible-conflict" role="alert"><ShieldAlert size={17}/><div><b>Conflicting approved visual states</b><p>{conflicts.map(item => item.message).join(" ") } Resolve these before asking Kuro to generate art.</p></div></div>}
      {bible && <>
        <div className="style-bible-base">
          <label><span>Project style name</span><input value={bible.title} onChange={event => update("title", event.target.value)} placeholder="e.g. Neon Hearts — urban romance action"/></label>
          <label><span>Unified original style summary</span><textarea rows={4} value={bible.styleSummary} onChange={event => update("styleSummary", event.target.value)} placeholder="Describe the consistent linework, rendering, palette, facial construction, proportions, and mood in your own project's terms."/></label>
        </div>
        <div className="style-bible-section-head"><div><h3>Inspiration map</h3><p>Each reference must have one named purpose. Proposed references do not enter Kuro's prompt until approved.</p></div><button onClick={() => setBible(current => current ? { ...current, inspirations: [...current.inspirations, { id: makeId(), work: "", aspect: "other", notes: "", status: "proposed" }] } : current)}><Plus size={14}/> Add reference</button></div>
        {bible.inspirations.map((item,index) => <article className="style-bible-card" key={item.id}>
          <header><b>Reference {index + 1}</b><button aria-label="Remove reference" onClick={() => setBible(current => current ? { ...current, inspirations: current.inspirations.filter(row => row.id !== item.id) } : current)}><Trash2 size={14}/></button></header>
          <div className="style-bible-card-grid">
            <label><span>Work / source</span><input value={item.work} onChange={event => updateInspiration(item.id,{work:event.target.value})} placeholder="Series, film, book, reference"/></label>
            <label><span>Aspect only</span><select value={item.aspect} onChange={event => updateInspiration(item.id,{aspect:event.target.value})}>{aspectOptions.map(aspect=><option key={aspect} value={aspect}>{aspect.replace(/-/g," ")}</option>)}</select></label>
            <label className="style-bible-wide"><span>Broad craft qualities to use</span><textarea rows={2} value={item.notes} onChange={event => updateInspiration(item.id,{notes:event.target.value})} placeholder="e.g. natural teasing, warm timing, original dialogue — never copy scenes or designs."/></label>
            <label><span>Reference URL (HTTPS only)</span><input value={item.sourceUrl ?? ""} onChange={event => updateInspiration(item.id,{sourceUrl:event.target.value})} placeholder="https://…"/></label><div className="style-bible-research"><a href={"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(item.work+" "+item.aspect)} target="_blank" rel="noreferrer">Search image references ↗</a><a href={"https://www.google.com/search?q="+encodeURIComponent(item.work+" "+item.aspect+" official visual design")} target="_blank" rel="noreferrer">Search source context ↗</a></div>
            <label><span>Canon status</span><select value={item.status} onChange={event => updateInspiration(item.id,{status:event.target.value as StyleRecordStatus})}>{statusOptions.map(status=><option key={status} value={status}>{status}</option>)}</select></label>
          </div>
        </article>)}
        <div className="style-bible-section-head"><div><h3>Locked style rules</h3><p>Persistent rules for linework, hair, scars, palette, rendering, and anything that must never drift.</p></div><button onClick={() => setBible(current => current ? { ...current, rules: [...current.rules, { id: makeId(), category: "continuity", rule: "", status: "proposed" }] } : current)}><Plus size={14}/> Add rule</button></div>
        {bible.rules.map((rule,index)=><article className="style-bible-card" key={rule.id}><header><b>Rule {index+1}</b><button aria-label="Remove rule" onClick={()=>setBible(current=>current?{...current,rules:current.rules.filter(row=>row.id!==rule.id)}:current)}><Trash2 size={14}/></button></header><div className="style-bible-card-grid">
          <label><span>Category</span><input value={rule.category} onChange={event=>updateRule(rule.id,{category:event.target.value})} placeholder="continuity, linework, palette…"/></label>
          <label><span>Status</span><select value={rule.status} onChange={event=>updateRule(rule.id,{status:event.target.value as StyleRecordStatus})}>{statusOptions.map(status=><option key={status}>{status}</option>)}</select></label>
          <label className="style-bible-wide"><span>Rule</span><textarea rows={2} value={rule.rule} onChange={event=>updateRule(rule.id,{rule:event.target.value})} placeholder="A scar persists in all later visual states unless an approved event explains its removal."/></label>
        </div></article>)}
        <div className="style-bible-section-head"><div><h3>Character visual timeline</h3><p>Approved states apply from their story order onward. Earlier chapter prompts cannot see future scars, haircuts, aging, or injuries.</p></div><button onClick={() => setBible(current => current ? { ...current, characterStates: [...current.characterStates, { id: makeId(), characterName: "", storyOrder: 1, chapterLabel: "Chapter 1", chapterNumber: 1, age: "", hair: "", scars: "", outfit: "", body: "", eyes: "", accessories: "", injuries: "", other: "", status: "proposed" }] } : current)}><Plus size={14}/> Add character state</button></div>
        {bible.characterStates.slice().sort((a,b)=>a.storyOrder-b.storyOrder).map((state,index)=><article className="style-bible-card" key={state.id}><header><b>{state.characterName || "Unnamed character"} · {state.chapterLabel || "No chapter"}</b><button aria-label="Remove character state" onClick={()=>setBible(current=>current?{...current,characterStates:current.characterStates.filter(row=>row.id!==state.id)}:current)}><Trash2 size={14}/></button></header>
          <div className="style-bible-card-grid">
            <label><span>Character name</span><input value={state.characterName} onChange={event=>updateState(state.id,{characterName:event.target.value})} placeholder="Exact character name"/></label>
            <label><span>Chapter / scene label</span><input value={state.chapterLabel} onChange={event=>updateState(state.id,{chapterLabel:event.target.value})} placeholder="Chapter 12 · after the duel"/></label>
            <label><span>Story order (number)</span><input type="number" min="0" value={state.storyOrder} onChange={event=>updateState(state.id,{storyOrder:Number(event.target.value)})}/></label><label><span>Chapter number</span><input type="number" min="0" value={state.chapterNumber ?? ""} onChange={event=>updateState(state.id,{chapterNumber:event.target.value===""?undefined:Number(event.target.value)})}/></label>
            <label><span>Age at this point</span><input value={state.age ?? ""} onChange={event=>updateState(state.id,{age:event.target.value})} placeholder="18"/></label>
            <label><span>Hair</span><input value={state.hair ?? ""} onChange={event=>updateState(state.id,{hair:event.target.value})} placeholder="Length, style, parting, color"/></label>
            <label><span>Scars</span><input value={state.scars ?? ""} onChange={event=>updateState(state.id,{scars:event.target.value})} placeholder="Location, shape, persistence"/></label>
            <label><span>Outfit</span><input value={state.outfit ?? ""} onChange={event=>updateState(state.id,{outfit:event.target.value})} placeholder="Current clothing state"/></label>
            <label><span>Eyes</span><input value={state.eyes ?? ""} onChange={event=>updateState(state.id,{eyes:event.target.value})} placeholder="Shape, color, permanent traits"/></label>
            <label><span>Body / proportions</span><input value={state.body ?? ""} onChange={event=>updateState(state.id,{body:event.target.value})} placeholder="Height, build, proportions"/></label>
            <label><span>Accessories / props</span><input value={state.accessories ?? ""} onChange={event=>updateState(state.id,{accessories:event.target.value})} placeholder="Glasses, jewelry, keepsakes"/></label>
            <label><span>Injuries</span><input value={state.injuries ?? ""} onChange={event=>updateState(state.id,{injuries:event.target.value})} placeholder="Current / healed injuries"/></label>
            <label><span>Other invariants</span><input value={state.other ?? ""} onChange={event=>updateState(state.id,{other:event.target.value})} placeholder="Tattoos, signature details…"/></label>
            <label><span>Canon status</span><select value={state.status} onChange={event=>updateState(state.id,{status:event.target.value as StyleRecordStatus})}>{statusOptions.map(status=><option key={status} value={status}>{status}</option>)}</select></label>
          </div>
          {state.status==="approved" ? <p className="style-bible-approved"><Check size={13}/> This state can be used for this chapter and later chapters.</p> : <p className="style-bible-pending">This state is not used as established visual canon until approved.</p>}
        </article>)}
      </>}
      <p className="style-bible-footnote">Safety rule: conflicting approved designs at the same story order block generation rather than choosing a random version. Missing visual history stays unknown; it is never silently invented.</p>
    </>}
  </section>;
}
