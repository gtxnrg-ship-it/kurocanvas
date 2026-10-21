import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ImagePlus, LoaderCircle, Search, ShieldCheck, Trash2 } from "lucide-react";
import { referenceSourceStorage } from "../core/storage";
import { searchWikimediaCommons, type ReferenceSearchResult, type ReferenceSourceRecord, type ReferenceStatus } from "./referenceScout";
import "./referenceScout.css";

type ProjectChoice = { id: string; name: string };
const now = () => new Date().toISOString();

export default function ReferenceScout({ projectId, projects }: { projectId: string; projects: ProjectChoice[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReferenceSearchResult[]>([]);
  const [library, setLibrary] = useState<ReferenceSourceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Search real reference images, review the source and license, then approve only what belongs in this project's visual library.");

  async function refreshLibrary() {
    if (!projectId) { setLibrary([]); return; }
    try { setLibrary(await referenceSourceStorage.list(projectId)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the reference library."); }
  }
  useEffect(() => { void refreshLibrary(); }, [projectId]);

  async function search() {
    if (!projectId) { setMessage("Choose a project before searching."); return; }
    setBusy(true); setMessage("Searching Wikimedia Commons for image sources…");
    try {
      const found = await searchWikimediaCommons(query);
      setResults(found);
      setMessage(found.length ? "Found " + found.length + " results. Review each source page and its license before using it." : "No image results found. Try broader terms or use the web-search links.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reference search failed."); }
    finally { setBusy(false); }
  }

  async function saveResult(result: ReferenceSearchResult) {
    if (!projectId) return;
    const existing = library.find(record => record.sourceUrl === result.sourceUrl);
    if (existing) { setMessage("This source is already in the project reference library."); return; }
    const timestamp = now();
    const record: ReferenceSourceRecord = { ...result, id: crypto.randomUUID(), projectId, notes: "", tags: [], status: "proposed", createdAt: timestamp, updatedAt: timestamp };
    setBusy(true);
    try { await referenceSourceStorage.save(record); setLibrary(current => [record, ...current]); setMessage("Saved as a proposal. Approve it after reviewing the source and license."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this reference."); }
    finally { setBusy(false); }
  }

  async function changeStatus(record: ReferenceSourceRecord, status: ReferenceStatus) {
    const next = { ...record, status, updatedAt: now() };
    setBusy(true);
    try { await referenceSourceStorage.save(next); setLibrary(current => current.map(item => item.id === record.id ? next : item)); setMessage(status === "approved" ? "Reference approved for this project's AI context." : status === "rejected" ? "Reference rejected; it will not be used as approved context." : "Reference returned to proposed status."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update reference status."); }
    finally { setBusy(false); }
  }
  async function updateNotes(record: ReferenceSourceRecord, notes: string) {
    const next = { ...record, notes, updatedAt: now() };
    setLibrary(current => current.map(item => item.id === record.id ? next : item));
    try { await referenceSourceStorage.save(next); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save reference notes."); }
  }
  async function remove(record: ReferenceSourceRecord) {
    setBusy(true);
    try { await referenceSourceStorage.remove(record.id, projectId); setLibrary(current => current.filter(item => item.id !== record.id)); setMessage("Removed the reference from this project."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove reference."); }
    finally { setBusy(false); }
  }

  const knownSources = useMemo(() => new Set(library.map(record => record.sourceUrl)), [library]);
  const activeProject = projects.find(project => project.id === projectId);
  return <section className="reference-scout">
    <header className="reference-scout-head"><div><small>REFERENCE RESEARCH · SOURCE-AWARE</small><h2><ImagePlus size={20}/> Reference Scout</h2><p>Search actual image records, preserve source and license details, and approve project-specific references for Kuro's planning context.</p></div></header>
    {!projectId ? <p className="reference-scout-message">Choose a project to keep its references separate.</p> : <>
      <div className="reference-scout-project"><b>{activeProject?.name ?? "Active project"}</b><span>Project-only reference library</span></div>
      <form className="reference-scout-search" onSubmit={event => { event.preventDefault(); void search(); }}>
        <label htmlFor="reference-query">What do you need to reference?</label>
        <div><Search size={17}/><input id="reference-query" value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. undercut hairstyle, rainy Tokyo alley, school uniform folds" minLength={2}/><button type="submit" disabled={busy || query.trim().length < 2}>{busy ? <LoaderCircle size={15} className="reference-spin"/> : <Search size={15}/>}Search images</button></div>
        <p>Search sends only your query to Wikimedia Commons. Results include source pages and available license metadata; license details still need human review.</p>
        <nav><a href={"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(query || "manga visual reference")} target="_blank" rel="noreferrer">Broader image search <ExternalLink size={12}/></a><a href={"https://www.google.com/search?q="+encodeURIComponent((query || "visual reference")+" official source")} target="_blank" rel="noreferrer">Source/context search <ExternalLink size={12}/></a></nav>
      </form>
      <p className="reference-scout-message" role="status">{message}</p>
      {results.length > 0 && <><div className="reference-scout-section-title"><h3>Search results</h3><span>{results.length} sources</span></div><div className="reference-scout-grid">{results.map(result => <article className="reference-result" key={result.sourceUrl}>
        <a className="reference-result-image" href={result.sourceUrl} target="_blank" rel="noreferrer"><img src={result.thumbnailUrl} alt={result.title} loading="lazy"/><span>Open source ↗</span></a>
        <div className="reference-result-body"><h4>{result.title}</h4>{result.description && <p>{result.description}</p>}<small>Creator: {result.creator}</small><small>License: {result.license}</small><div className="reference-result-links"><a href={result.sourceUrl} target="_blank" rel="noreferrer">Source page <ExternalLink size={11}/></a>{result.licenseUrl && <a href={result.licenseUrl} target="_blank" rel="noreferrer">License terms <ExternalLink size={11}/></a>}</div>
          <button disabled={busy || knownSources.has(result.sourceUrl)} onClick={() => void saveResult(result)}>{knownSources.has(result.sourceUrl) ? <ShieldCheck size={14}/> : <PlusIcon/>}{knownSources.has(result.sourceUrl) ? "Already saved" : "Save as proposal"}</button></div>
      </article>)}</div></>}
      <div className="reference-scout-section-title"><h3>Project reference library</h3><span>{library.length} saved</span></div>
      {!library.length && <p className="reference-scout-empty">No references saved yet. Search above, then add a source as a proposal for review.</p>}
      <div className="reference-library-list">{library.map(record => <article className="reference-library-item" key={record.id}>
        <img src={record.thumbnailUrl} alt="" loading="lazy"/>
        <div className="reference-library-details"><div className="reference-library-title"><b>{record.title}</b><span className={"reference-status reference-status-"+record.status}>{record.status}</span></div>
          <small>{record.license} · {record.creator}</small><a href={record.sourceUrl} target="_blank" rel="noreferrer">Review source page <ExternalLink size={11}/></a>
          <label>How this should inform the project<textarea rows={2} value={record.notes} onChange={event => setLibrary(current => current.map(item => item.id === record.id ? { ...item, notes: event.target.value } : item))} onBlur={event => void updateNotes(record,event.target.value)} placeholder="e.g. use the lighting reference only; do not copy the subject's identity."/></label>
          <div className="reference-library-actions"><button disabled={busy} onClick={() => void changeStatus(record,"approved")}><ShieldCheck size={13}/> Approve</button><button disabled={busy} onClick={() => void changeStatus(record,"proposed")}>Propose</button><button disabled={busy} onClick={() => void changeStatus(record,"rejected")}>Reject</button><button disabled={busy} onClick={() => void remove(record)}><Trash2 size={13}/> Remove</button></div>
        </div>
      </article>)}</div>
    </>}
  </section>;
}

function PlusIcon() { return <ImagePlus size={14}/>; }
