import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Bell, BookOpen, CheckCircle2, ExternalLink, LoaderCircle, Pause, Play, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import {
  cancelResearchTask, enqueueResearchTask, pauseResearchQueue, requestResearchNotificationPermission,
  researchTaskStorage, resumeResearchQueue, retryResearchTask, type ResearchDepth, type ResearchTaskRecord,
} from "./researchQueue";
import "./researchStudio.css";

type ProjectChoice = { id: string; name: string };
type Props = { projectId: string; projects: ProjectChoice[]; onProjectChange: (id: string) => void; onAskKuro: (message: string) => void };
const DEPTHS: Array<{ value: ResearchDepth; label: string; note: string }> = [
  { value: "quick", label: "Quick", note: "Up to 3 source summaries" },
  { value: "balanced", label: "Balanced", note: "Up to 5 source summaries" },
  { value: "deep", label: "Deep", note: "Up to 8 source summaries" },
  { value: "exhaustive", label: "Exhaustive", note: "Up to 12 source summaries" },
];
const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export default function ResearchStudio({ projectId, projects, onProjectChange, onAskKuro }: Props) {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("deep");
  const [tasks, setTasks] = useState<ResearchTaskRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("Kuro can collect sourced background research for a universe, period, fighting discipline, culture, or historical event.");
  const [notificationState, setNotificationState] = useState<string>("Checking…");

  async function refresh() {
    if (!projectId) { setTasks([]); return; }
    try { setTasks(await researchTaskStorage.list(projectId)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load saved research tasks."); }
  }

  useEffect(() => {
    let alive = true;
    const update = () => { if (alive) void refresh(); };
    update();
    const interval = window.setInterval(update, 4000);
    window.addEventListener("kuro-research-queue-changed", update);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("kuro-research-queue") : undefined;
    channel?.addEventListener("message", update);
    if (typeof window !== "undefined") {
      setNotificationState("Notification" in window && window.isSecureContext ? Notification.permission : "unsupported");
    }
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("kuro-research-queue-changed", update);
      channel?.removeEventListener("message", update);
      channel?.close();
    };
  }, [projectId]);

  const counts = useMemo(() => ({
    queued: tasks.filter(task => task.status === "queued").length,
    running: tasks.filter(task => task.status === "running").length,
    completed: tasks.filter(task => task.status === "completed").length,
    failed: tasks.filter(task => task.status === "failed").length,
  }), [tasks]);
  const activeProject = projects.find(project => project.id === projectId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!projectId) { setMessage("Choose a project so this research stays inside the right universe."); return; }
    if (query.trim().length < 2) { setMessage("Describe at least two characters of the research topic."); return; }
    setBusy(true);
    try {
      const task = await enqueueResearchTask({ projectId, query: query.trim(), depth });
      setQuery("");
      setMessage("Research queued for “" + task.query + "”. The queue is saved locally and will resume when Kuro opens again.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not queue the research task."); }
    finally { setBusy(false); }
  }

  async function changeNotificationPermission() {
    const result = await requestResearchNotificationPermission();
    setNotificationState(result);
    if (result === "granted") setMessage("Notifications enabled. Kuro can notify you when a research task finishes while the app is allowed to run.");
    else if (result === "denied") setMessage("Notifications are blocked in browser settings. Research still saves to the queue and its result appears here.");
    else setMessage("This browser or page context does not support notifications. The saved queue still works while Kuro is open.");
  }

  async function retry(task: ResearchTaskRecord) {
    try { await retryResearchTask(task); setMessage("Retry queued for “" + task.query + "”."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry this task."); }
  }
  async function cancel(task: ResearchTaskRecord) {
    try { await cancelResearchTask(task.id, projectId); setMessage("Cancelled “" + task.query + "”."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not cancel this task."); }
  }
  async function remove(task: ResearchTaskRecord) {
    try { await researchTaskStorage.remove(task.id, projectId); await refresh(); setMessage("Removed the research task from this project."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove this task."); }
  }

  return <section className="research-studio" aria-label="Research task queue">
    <header className="research-studio-head">
      <div><small>RESEARCH LAB · PERSISTENT QUEUE</small><h2><Search size={20}/> Research with Kuro</h2><p>Collect source-linked material first, then ask Kuro to connect it to your world's rules, story and visual choices.</p></div>
      <div className="research-head-actions">
        <button type="button" onClick={() => void refresh()} aria-label="Refresh research queue"><RefreshCw size={14}/></button>
        <button type="button" className="research-notify" onClick={() => void changeNotificationPermission()}><Bell size={14}/> {notificationState === "granted" ? "Notifications on" : notificationState === "denied" ? "Notifications blocked" : "Enable notifications"}</button>
      </div>
    </header>
    {!projectId ? <div className="research-empty"><AlertCircle size={17}/><span>Choose a project before researching so the findings stay isolated from other universes.</span></div> : <>
      <div className="research-project-line"><b>{activeProject?.name ?? "Active project"}</b><span>Saved to this universe only</span></div>
      <form className="research-new-task" onSubmit={event => void submit(event)}>
        <label htmlFor="kuro-research-query">What should Kuro research?</label>
        <textarea id="kuro-research-query" value={query} onChange={event => setQuery(event.target.value)} rows={3} maxLength={1800}
          placeholder="e.g. Research late Edo-period policing, common street clothing, sword schools, and how urban districts were organized. Collect details useful for an original fictional city." required />
        <div className="research-compose-bottom">
          <label>Research depth<select value={depth} onChange={event => setDepth(event.target.value as ResearchDepth)}>{DEPTHS.map(item => <option key={item.value} value={item.value}>{item.label} — {item.note}</option>)}</select></label>
          <button type="submit" disabled={busy || query.trim().length < 2}>{busy ? <LoaderCircle className="research-spin" size={15}/> : <Plus size={15}/>} Add research task</button>
        </div>
        <p className="research-source-note">Current source collector uses English Wikipedia's public API and preserves article URLs with each extract. Treat the results as starting sources to compare—not as unquestionable truth or approved story canon.</p>
      </form>
      <div className="research-queue-head"><div><h3>Research queue</h3><span>{counts.queued} queued · {counts.running} running · {counts.completed} completed · {counts.failed} need attention</span></div>
        {paused ? <button type="button" onClick={() => { resumeResearchQueue(); setPaused(false); setMessage("Research queue resumed."); }}><Play size={14}/> Resume queue</button>
          : <button type="button" onClick={() => { pauseResearchQueue(); setPaused(true); setMessage("Research queue paused. Any in-flight lookup will return to the queue."); }}><Pause size={14}/> Pause queue</button>}
      </div>
      {tasks.length === 0 ? <div className="research-empty"><BookOpen size={18}/><span>No research tasks yet. Add a topic above; finished source material can later be included in Kuro's chat context.</span></div> :
        <div className="research-task-list">{tasks.map(task => <article className={"research-task research-task-"+task.status} key={task.id}>
          <div className="research-task-top">
            <div><span className={"research-status research-status-"+task.status}>{task.status === "completed" ? <CheckCircle2 size={12}/> : task.status === "failed" ? <AlertCircle size={12}/> : task.status === "running" ? <LoaderCircle className="research-spin" size={12}/> : task.status === "cancelled" ? <X size={12}/> : <ClockStatus/>}{task.status}</span><small>{task.depth} · queued {timeLabel(task.createdAt)}</small></div>
            <div className="research-task-actions">
              {(task.status === "queued" || task.status === "running") && <button type="button" onClick={() => void cancel(task)}><X size={12}/> Cancel</button>}
              {task.status === "failed" && <button type="button" onClick={() => void retry(task)}><RefreshCw size={12}/> Retry</button>}
              {["completed","failed","cancelled"].includes(task.status) && <button type="button" onClick={() => void remove(task)} aria-label={"Remove "+task.query}><Trash2 size={12}/></button>}
            </div>
          </div>
          <h4>{task.query}</h4>
          {task.status === "running" && <><div className="research-progress-track"><span style={{ width: task.progress + "%" }}/></div><small>{task.stage} · {task.progress}%</small></>}
          {task.error && <p className="research-task-error">{task.error}</p>}
          {task.status === "completed" && <div className="research-complete-line">{task.sources.length} source summaries · {task.stage}</div>}
          {task.sources.length > 0 && <div className="research-sources">{task.sources.map((source, index) => <details key={source.url}><summary><span>{index+1}. {source.title}</span><small>Source excerpt</small></summary><p>{source.extract}</p><a href={source.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={11}/></a></details>)}</div>}
          {task.status === "completed" && <button type="button" className="research-ask-kuro" onClick={() => onAskKuro("Use the source-linked research in my Research Vault about: " + task.query + ". Synthesize the findings in detail for the active universe. Separate documented facts from interpretation and fictional additions, cite the saved article URLs, suggest useful worldbuilding/story/visual applications, and propose rather than silently approve any canon changes.")}><BookOpen size={14}/> Develop this with Kuro</button>}
        </article>)}</div>}
    </>}
    <p className="research-status-message" role="status" aria-live="polite">{message}</p>
    <p className="research-background-note"><Bell size={12}/> Background execution is best-effort and depends on browser support and OS power policy. Unfinished tasks remain saved and resume when Kuro reopens; guaranteed, unrestricted background work would require a native Android worker or a backend service.</p>
  </section>;
}

function ClockStatus() {
  return <span aria-hidden="true" className="research-clock-icon">◷</span>;
}
