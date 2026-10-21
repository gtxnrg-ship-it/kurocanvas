import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, Check, Clock3, History, Plus, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { storyMemoryStorage } from '../core/storage';
import type { StoryMemoryRecord } from './storyMemory';

type ProjectChoice = { id: string; name: string };
type Props = { projectId: string; projects: ProjectChoice[]; onProjectChange: (id: string) => void; onOpenDrawing: (id: string) => void };
type Kind = StoryMemoryRecord['kind'];
const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'chapter', label: 'Chapter recap' }, { value: 'event', label: 'Story event' },
  { value: 'character-change', label: 'Character change' }, { value: 'visual-reference', label: 'Visual reference' },
  { value: 'panel-template', label: 'Panel / template' },
];
const splitList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
const chapterLabel = (record: StoryMemoryRecord) => record.chapterNumber === undefined ? 'No chapter set' : 'Chapter ' + record.chapterNumber + (record.sceneNumber === undefined ? '' : ' · Scene ' + record.sceneNumber);

export default function StoryVault({ projectId, projects, onProjectChange, onOpenDrawing }: Props) {
  const [records, setRecords] = useState<StoryMemoryRecord[]>([]);
  const [kind, setKind] = useState<Kind>('chapter');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [chapter, setChapter] = useState('');
  const [scene, setScene] = useState('');
  const [entities, setEntities] = useState('');
  const [tags, setTags] = useState('');
  const [assets, setAssets] = useState('');
  const [query, setQuery] = useState('');
  const [timelineEntity, setTimelineEntity] = useState('');
  const [filter, setFilter] = useState<'all'|'approved'|'proposed'|'superseded'>('all');
  const [supersedesId, setSupersedesId] = useState('');
  const [notice, setNotice] = useState('Choose a project to open its durable story memory.');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function refresh() {
    if (!projectId) { setRecords([]); setNotice('Choose or create a project before saving story history.'); return; }
    try { setRecords(await storyMemoryStorage.list(projectId)); setNotice('Story memory loaded from this device.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load story memory.'); }
  }
  useEffect(() => { void refresh(); }, [projectId]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter(record => (filter === 'all' || record.status === filter) &&
      (!needle || [record.title, record.summary, ...record.tags, ...record.entityIds].join(' ').toLocaleLowerCase().includes(needle)))
      .sort((a,b) => (b.chapterNumber ?? -1) - (a.chapterNumber ?? -1) || b.updatedAt.localeCompare(a.updatedAt));
  }, [records, query, filter]);

  const timelineEntities = useMemo(() => [...new Set(records.flatMap(record => record.entityIds.map(id => id.trim()).filter(Boolean)))].sort((a,b) => a.localeCompare(b)), [records]);
  const timelineRecords = useMemo(() => records
    .filter(record => timelineEntity && record.entityIds.some(id => id.trim().toLocaleLowerCase() === timelineEntity.toLocaleLowerCase()))
    .sort((a,b) => (a.chapterNumber ?? -1) - (b.chapterNumber ?? -1) || (a.sceneNumber ?? -1) - (b.sceneNumber ?? -1) || a.createdAt.localeCompare(b.createdAt)), [records, timelineEntity]);

  async function addMemory(event: FormEvent) {
    event.preventDefault();
    if (!projectId) { setNotice('Choose a project first.'); return; }
    if (!title.trim() || !summary.trim()) { setNotice('Add both a title and a factual summary.'); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const record: StoryMemoryRecord = {
        id: editingId ?? crypto.randomUUID(), projectId, kind, title: title.trim(), summary: summary.trim(),
        ...(chapter.trim() ? { chapterNumber: Number(chapter) } : {}),
        ...(scene.trim() ? { sceneNumber: Number(scene) } : {}),
        entityIds: splitList(entities), tags: splitList(tags), source: 'user', status: 'proposed',
        assetRefs: splitList(assets), supersedes: supersedesId ? [supersedesId] : [],
        createdAt: records.find(item => item.id === editingId)?.createdAt ?? now, updatedAt: now,
      };
      await storyMemoryStorage.save(record);
      setTitle(''); setSummary(''); setEntities(''); setTags(''); setAssets(''); setChapter(''); setScene(''); setSupersedesId(''); setEditingId(null);
      await refresh();
      setNotice(editingId ? 'Proposal updated. It remains unapproved until you review it.' : 'Saved as a proposal. Approve it when the details are accurate; proposals do not count as established canon.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save story memory.'); }
    finally { setBusy(false); }
  }

  async function approve(record: StoryMemoryRecord) {
    setBusy(true);
    try {
      // Keep old versions as superseded records so chapter-specific flashbacks can still retrieve them.
      for (const oldId of record.supersedes) {
        const old = records.find(item => item.id === oldId);
        if (old) await storyMemoryStorage.save({ ...old, status: 'superseded', updatedAt: new Date().toISOString() });
      }
      await storyMemoryStorage.save({ ...record, status: 'approved', updatedAt: new Date().toISOString() });
      await refresh(); setNotice('Approved and saved to project history.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not approve memory.'); }
    finally { setBusy(false); }
  }

  function editProposal(record: StoryMemoryRecord) {
    setEditingId(record.id); setKind(record.kind); setTitle(record.title); setSummary(record.summary);
    setChapter(record.chapterNumber === undefined ? '' : String(record.chapterNumber));
    setScene(record.sceneNumber === undefined ? '' : String(record.sceneNumber));
    setEntities(record.entityIds.join(', ')); setTags(record.tags.join(', ')); setAssets(record.assetRefs.join(', '));
    setSupersedesId(record.supersedes[0] ?? '');
    setNotice('Editing a proposal. Saving keeps it unapproved until you approve it.');
    globalThis.document?.getElementById('story-memory-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function supersede(record: StoryMemoryRecord) {
    setSupersedesId(record.id); setKind(record.kind); setTitle(record.title + ' — revised'); setSummary(record.summary);
    setChapter(record.chapterNumber === undefined ? '' : String(record.chapterNumber));
    setScene(record.sceneNumber === undefined ? '' : String(record.sceneNumber));
    setEntities(record.entityIds.join(', ')); setTags(record.tags.join(', ')); setAssets(record.assetRefs.join(', '));
    setNotice('Revision draft prepared. Edit the summary and approve the new version to preserve this older record for chapter flashbacks.');
    globalThis.document?.getElementById('story-memory-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function remove(record: StoryMemoryRecord) {
    if (!globalThis.confirm('Delete this memory permanently? This cannot be undone.')) return;
    setBusy(true);
    try { await storyMemoryStorage.remove(record.id, projectId); await refresh(); setNotice('Memory deleted.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete memory.'); }
    finally { setBusy(false); }
  }

  return <section className="story-vault">
    <div className="story-vault-head">
      <div><small>PROJECT-SCOPED CONTINUITY</small><h2>Story vault</h2><p>Chapter history, character changes, events, reusable panels, and visual references. Unapproved notes never become established canon.</p></div>
      <button disabled={busy} onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button>
    </div>
    <label className="story-project-select">Active project
      <select value={projectId} onChange={event => onProjectChange(event.target.value)}>
        <option value="">Choose a project…</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
    {!projectId ? <div className="story-vault-empty"><ShieldAlert size={22}/><b>No project selected</b><span>Story memory must be scoped to a project so separate series cannot leak into each other.</span></div> : <>
      <form id="story-memory-editor" className="story-memory-editor" onSubmit={event => void addMemory(event)}>
        <div className="story-editor-title"><div><Plus size={16}/><b>{editingId ? 'Edit story-memory proposal' : 'Add a memory'}</b></div><span>NEW ITEMS START AS PROPOSALS</span>{editingId && <button type="button" onClick={() => { setEditingId(null); setTitle(''); setSummary(''); setNotice('Proposal editing cancelled.'); }}>Cancel edit</button>}</div>
        <label>Memory type<select value={kind} onChange={event => setKind(event.target.value as Kind)}>{KINDS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Mira loses her left sleeve" required maxLength={180}/></label>
        <label>What actually happened?<textarea value={summary} onChange={event => setSummary(event.target.value)} placeholder="Record confirmed events, character state, exact visual details, and what must stay consistent…" rows={4} required maxLength={6000}/></label>
        <div className="story-form-grid"><label>Chapter<input type="number" min="0" step="1" value={chapter} onChange={event => setChapter(event.target.value)} placeholder="Optional"/></label><label>Scene<input type="number" min="0" step="1" value={scene} onChange={event => setScene(event.target.value)} placeholder="Optional"/></label></div>
        <label>Character / entity IDs <small>Comma-separated, stable IDs work best</small><input value={entities} onChange={event => setEntities(event.target.value)} placeholder="mira, silver-oath"/></label>
        <label>Search tags <input value={tags} onChange={event => setTags(event.target.value)} placeholder="flashback, injury, bridge"/></label>
        <label>Reusable asset references <small>Saved panel or template IDs; this links assets, it does not copy files yet</small><input value={assets} onChange={event => setAssets(event.target.value)} placeholder="panel-bridge-03, template-flashback-blue"/></label>
        <label>Revises earlier memory <select value={supersedesId} onChange={event => setSupersedesId(event.target.value)}><option value="">None — new history</option>{records.filter(record => record.status === 'approved').map(record => <option key={record.id} value={record.id}>{chapterLabel(record)} · {record.title}</option>)}</select></label>
        <div className="story-editor-foot"><span>Saved locally · No model is allowed to silently approve canon.</span><button disabled={busy || !title.trim() || !summary.trim()} type="submit">{editingId ? 'Update proposal' : 'Save proposal'}</button></div>
      </form>
      <section className="story-character-timeline" aria-label="Character history timeline">
        <div className="story-character-timeline-head"><div><h3>Character timeline</h3><p>Follow an entity across chapters, including older states preserved for flashbacks.</p></div>
          <label>Character / entity<select aria-label="Choose character history" value={timelineEntity} onChange={event => setTimelineEntity(event.target.value)}><option value="">Choose an entity…</option>{timelineEntities.map(entity => <option key={entity} value={entity}>{entity}</option>)}</select></label>
        </div>
        {!timelineEntity ? <p className="story-timeline-empty">Add stable character/entity IDs to memories to build a timeline.</p> :
          timelineRecords.length === 0 ? <p className="story-timeline-empty">No records are linked to {timelineEntity} yet.</p> :
          <ol className="story-timeline-list">{timelineRecords.map(record => {
            const newer = records.filter(candidate => candidate.supersedes.includes(record.id));
            return <li key={record.id} className={'story-timeline-entry '+record.status}>
              <span className="story-timeline-marker" aria-hidden="true"/>
              <div className="story-timeline-card">
                <div className="story-timeline-meta"><span>{chapterLabel(record)}</span><span className={'story-status '+record.status}>{record.status==='approved'?'Approved':record.status==='proposed'?'Needs review':'Older version'}</span></div>
                <b>{record.title}</b><p>{record.summary}</p>
                {newer.length>0 && <small>Revised later by: {newer.map(item => item.title).join(', ')}</small>}
                {record.status==='approved' && <button type="button" disabled={busy} onClick={() => supersede(record)}>Revise this state</button>}
              </div>
            </li>;
          })}</ol>}
      </section>
      <div className="story-memory-list-head"><div><h3>Recorded history</h3><span>{records.length} {records.length === 1 ? 'record' : 'records'}</span></div><div className="story-memory-filters"><label><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search story memory"/></label><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} aria-label="Filter memory status"><option value="all">All statuses</option><option value="approved">Approved</option><option value="proposed">Proposals</option><option value="superseded">Older versions</option></select></div></div>
      {visible.length === 0 ? <div className="story-vault-empty"><History size={22}/><b>No matching history yet</b><span>Add a recap or character change. Kuro should say when the requested chapter has not been recorded instead of inventing it.</span></div> :
        <div className="story-memory-records">{visible.map(record => <article className={'story-memory-record '+record.status} key={record.id}>
          <div className="story-record-top"><span className="story-kind">{KINDS.find(item => item.value === record.kind)?.label ?? record.kind}</span><span className={'story-status '+record.status}>{record.status === 'approved' ? <><Check size={12}/> Approved</> : record.status === 'proposed' ? <><Clock3 size={12}/> Needs review</> : <><History size={12}/> Older version</>}</span></div>
          <h4>{record.title}</h4><small className="story-record-chapter">{chapterLabel(record)}</small><p>{record.summary}</p>
          {record.entityIds.length > 0 && <div className="story-chips">{record.entityIds.map(id => <span key={id}>{id}</span>)}</div>}
          {record.assetRefs.length > 0 && <><small className="story-assets">Linked assets: {record.assetRefs.join(', ')}</small><div className="story-record-actions">{record.assetRefs.filter(asset => asset.startsWith('drawing:')).map(asset => <button key={asset} disabled={busy} onClick={() => onOpenDrawing(asset.slice('drawing:'.length))}><BookOpen size={13}/> Open saved drawing</button>)}</div></>}
          {record.supersedes.length > 0 && <small className="story-assets">Revises: {records.find(item => item.id === record.supersedes[0])?.title ?? record.supersedes.join(', ')}</small>}
          <div className="story-record-actions">{record.status === 'proposed' && <><button disabled={busy} onClick={() => editProposal(record)}><History size={13}/> Edit proposal</button><button disabled={busy} className="story-approve" onClick={() => void approve(record)}><Check size={13}/> Approve memory</button></>}{record.status === 'approved' && <button disabled={busy} onClick={() => supersede(record)}><History size={13}/> Revise / preserve history</button>}<button disabled={busy} className="story-delete" onClick={() => void remove(record)}><Trash2 size={13}/> Delete</button></div>
        </article>)}</div>}
    </>}
    <p className="story-vault-notice" role="status" aria-live="polite">{notice}</p>
  </section>;
}
