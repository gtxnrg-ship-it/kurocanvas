import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Palette, Plus, Save, ShieldCheck, Trash2, WandSparkles } from "lucide-react";
import { approveSeriesPlan, evaluateSeriesPlan, isSeriesPlanApproved, validateSeriesPlan, type SeriesPlanFields } from "./seriesPlan";
import { artDirectionStorage } from "../core/storage";
import { ART_DIRECTION_FIELDS, createEmptyArtDirection, type ArtDirectionBible, type ArtDirectionField, type ArtDirectionInfluence } from "./artDirection";
import "./artDirectionStudio.css";

type ProjectChoice = { id: string; name: string };
const makeId = () => crypto.randomUUID();

export default function ArtDirectionStudio({ projectId, projects, onSynthesize }: { projectId: string; projects: ProjectChoice[]; onSynthesize?: (bible: ArtDirectionBible) => Promise<Partial<ArtDirectionBible>> }) {
  const [bible, setBible] = useState<ArtDirectionBible | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose a project to define its consistent story and visual language.");
  const [seriesPlanMessage, setSeriesPlanMessage] = useState("Map the full story through its ending before asking Kuro to produce any chapter.");

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
  function updateSeriesPlanField(key: "seriesScope" | "seriesArcPlan" | "seriesChapterPlan" | "seriesEnding", value: string) {
    setBible(current => current ? { ...current, [key]: value, seriesPlanApproved: false, seriesPlanApprovalSignature: "" } : current);
    setSeriesPlanMessage("Plan edited. Review and approve the complete outline again before chapter production.");
  }

  async function approveWholeSeriesPlan() {
    if (!bible || !projectId) return;
    const issues = validateSeriesPlan(bible as SeriesPlanFields);
    if (issues.length) {
      setSeriesPlanMessage("Not ready for approval yet:\n" + issues.map((issue, index) => (index + 1) + ". " + issue.message).join("\n"));
      return;
    }
    setBusy(true);
    try {
      const approved = approveSeriesPlan(bible as SeriesPlanFields);
      const next = { ...bible, ...approved, projectId, updatedAt: new Date().toISOString() } as ArtDirectionBible;
      await artDirectionStorage.save(next);
      setBible(next);
      setSeriesPlanMessage("Whole-series plan approved and saved. Editing any plan field will revoke this approval; Kuro can now begin chapter production against this locked sequence.");
    } catch (error) {
      setSeriesPlanMessage(error instanceof Error ? error.message : "Could not approve and save the series plan.");
    } finally {
      setBusy(false);
    }
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

  async function synthesize() {
    if (!bible || !onSynthesize) { setMessage("Connect a model in Preferences to synthesize a cohesive style."); return; }
    setBusy(true);
    try {
      const draft = await onSynthesize(bible);
      setBible(current => current ? { ...current, ...draft, projectId: current.projectId, schemaVersion: 1, influences: current.influences, updatedAt: new Date().toISOString() } : current);
      setMessage("Kuro drafted a cohesive original art direction. Review every field, adjust anything you disagree with, then save to lock it in.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not synthesize art direction."); }
    finally { setBusy(false); }
  }

  const activeProject = projects.find(project => project.id === projectId);
  return <section className="art-direction-studio">
    <header className="art-direction-head">
      <div><small>STYLE DNA · PROJECT-LOCKED</small><h2><Palette size={20}/> Art direction bible</h2>
        <p>Blend story, relationship, ensemble, and visual inspirations into one original style. Kuro receives these rules alongside approved canon and chapter history.</p></div>
      <div className="art-direction-header-actions"><button disabled={!bible || !projectId || busy || !onSynthesize} onClick={() => void synthesize()}><WandSparkles size={15}/>{busy ? "Working…" : "Synthesize with Kuro"}</button><button className="art-direction-save" disabled={!bible || !projectId || busy} onClick={() => void save()}><Save size={15}/>{busy ? "Saving…" : "Save art direction"}</button></div>
    </header>
    {!projectId ? <p className="art-direction-message">{message}</p> : <>
      <div className="art-direction-project"><ShieldCheck size={15}/><span><b>{activeProject?.name ?? "Active project"}</b><small>Separate style memory · no cross-project mixing</small></span></div>
      <p className="art-direction-message" role="status">{message}</p>
      {bible && <div className="art-direction-fields">{ART_DIRECTION_FIELDS.map(field => <label key={field.key} className={field.key === "title" || field.key === "premise" || field.key === "visualStyle" || field.key === "visualInvariants" ? "art-direction-wide" : ""}>
        <span>{field.label}</span><small>{field.hint}</small>
        {field.key === "title" ? <input value={bible[field.key]} onChange={event => updateField(field.key, event.target.value)} placeholder="e.g. Neon Hearts, Lasting Scars"/> :
          <textarea value={bible[field.key]} onChange={event => updateField(field.key, event.target.value)} rows={field.key === "premise" || field.key === "visualStyle" || field.key === "visualInvariants" || field.key === "avoid" ? 4 : 3} placeholder={"Define " + field.label.toLowerCase() + "…"} />}
      </label>)}</div>}
      {bible && (() => {
        const report = evaluateSeriesPlan(bible as SeriesPlanFields);
        const approved = isSeriesPlanApproved(bible as SeriesPlanFields);
        const contentIssues = report.issues.filter(issue => issue.id !== "approval");
        return <section className="series-plan-studio" aria-labelledby="series-plan-heading">
          <div className="series-plan-header">
            <div>
              <small>WHOLE-STORY CONTRACT</small>
              <h3 id="series-plan-heading">Series plan, opening to finale</h3>
              <p>Kuro can brainstorm and research at any time. Writing dialogue, storyboards, or chapter art stays locked until the entire chapter sequence and ending are reviewed and approved.</p>
            </div>
            <span className={approved ? "series-plan-state is-approved" : "series-plan-state"}>
              {approved ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>}
              {approved ? "Approved" : "Draft · not approved"}
            </span>
          </div>
          <div className="series-plan-fields">
            <label className="series-plan-wide">
              <span>Format, scope, and audience</span>
              <small>Specify the medium, intended length, readership, tone, and any format-specific rules. A standalone one-shot can be one chapter.</small>
              <textarea rows={3} value={bible.seriesScope ?? ""} onChange={event => updateSeriesPlanField("seriesScope", event.target.value)} placeholder="e.g. 24-episode vertical Webtoon, mystery-romance, with a complete resolution in the finale."/>
            </label>
            <label className="series-plan-wide">
              <span>Major arcs and character journeys</span>
              <small>Describe the arcs in order, escalating stakes, relationship changes, turning points, foreshadowing, and what the cast learns or loses.</small>
              <textarea rows={5} value={bible.seriesArcPlan ?? ""} onChange={event => updateSeriesPlanField("seriesArcPlan", event.target.value)} placeholder="Arc 1: establish the cast and central conflict…\nArc 2: consequences and new revelations…\nFinal arc: the decisive choice and resolution…"/>
            </label>
            <label className="series-plan-wide">
              <span>Complete chapter / episode outline</span>
              <small>One numbered entry per line, from 1 through the ending, with a meaningful event and character-change summary. Keep numbering gap-free.</small>
              <textarea className="series-plan-chapter-outline" rows={12} value={bible.seriesChapterPlan ?? ""} onChange={event => updateSeriesPlanField("seriesChapterPlan", event.target.value)} placeholder={"Chapter 1: Introduce the lead, establish the central want, and trigger the mystery.\nChapter 2: Show the consequence and change an important relationship.\nChapter 3: Reveal new evidence that redirects the investigation.\nChapter 4: Resolve the central conflict and pay off the opening setup."}/>
            </label>
            <label className="series-plan-wide">
              <span>Finale, reveals, and payoff map</span>
              <small>State the intended ending, resolved and unresolved threads, character outcomes, and how key early clues pay off.</small>
              <textarea rows={4} value={bible.seriesEnding ?? ""} onChange={event => updateSeriesPlanField("seriesEnding", event.target.value)} placeholder="At the finale, the main mystery resolves when… The emotional arc concludes with… Early clues pay off by…"/>
            </label>
          </div>
          <div className="series-plan-review">
            <p role="status" aria-live="polite">{seriesPlanMessage}</p>
            <div className="series-plan-summary">
              <b>{report.chapterCount} numbered chapter{report.chapterCount === 1 ? "" : "s"} found</b>
              <span>{approved ? "Approval matches the current outline." : contentIssues.length ? contentIssues.length + " requirement(s) still need attention." : "Complete, but not yet approved."}</span>
            </div>
            {contentIssues.length > 0 && <ul>{contentIssues.map((issue, index) => <li key={issue.id + index}>{issue.message}</li>)}</ul>}
            <button className="series-plan-approve" disabled={!projectId || busy || approved || !report.valid} onClick={() => void approveWholeSeriesPlan()}>
              <CheckCircle2 size={15}/>{busy ? "Saving…" : approved ? "Series plan approved" : "Review and approve full series"}
            </button>
            <small>Approval is stored with this project. If any outline field changes, the approval becomes invalid automatically.</small>
          </div>
        </section>;
      })()}
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
