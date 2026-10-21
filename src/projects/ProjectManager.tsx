import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Plus, Upload } from 'lucide-react';
import { createProject, type KuroProject } from '../core/project';
import { parseKuroPackage, serializeKuroPackage, createKuroPackage } from '../core/package';
import { artDirectionStorage, canonStorage, drawingStorage, projectStorage, referenceSourceStorage, storyMemoryStorage, styleBibleStorage, type LocalDrawingDocument } from '../core/storage';
import { validateCanon, type CanonBundle } from '../canon/universe';
import { validateStoryMemoryRecord, type StoryMemoryRecord } from '../canon/storyMemory';
import { validateArtDirection, type ArtDirectionBible } from '../canon/artDirection';
import { validateStyleBible, type ProjectStyleBible } from '../canon/styleBible';
import { validateReferenceSource, type ReferenceSourceRecord } from '../canon/referenceScout';
import WorldStudio from '../canon/WorldStudio';

type ProjectSummary = Pick<KuroProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>;

export default function ProjectManager({ onProjectsChanged }: { onProjectsChanged?: (projects: Array<{ id: string; name: string }>) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Projects and package files stay on this device.');
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try { const items = await projectStorage.list(); setProjects(items); onProjectsChanged?.(items.map(({ id, name }) => ({ id, name }))); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load local projects.'); }
  }

  useEffect(() => { void refresh(); }, []);

  async function createNew() {
    const name = globalThis.prompt('Name your project', 'Untitled project');
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const project = createProject(name);
      await projectStorage.save(project);
      await refresh();
      setMessage('Created “' + project.name + '”.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project creation failed.');
    } finally { setBusy(false); }
  }

  async function exportProject(id: string) {
    setBusy(true);
    try {
      const project = await projectStorage.load(id);
      if (!project) throw new Error('This project no longer exists in local storage.');
      const assets: Record<string, string> = {};
      const memories = await storyMemoryStorage.list(id);
      assets['kuro/story-memory.v1.json'] = JSON.stringify(memories);
      const artDirection = await artDirectionStorage.load(id);
      if (artDirection) assets['kuro/art-direction.v1.json'] = JSON.stringify(artDirection);
      const styleBible = await styleBibleStorage.load(id);
      if (styleBible) assets['kuro/style-bible.v1.json'] = JSON.stringify(styleBible);
      const references = await referenceSourceStorage.list(id);
      assets['kuro/references.v1.json'] = JSON.stringify(references);
      const canon = await canonStorage.load(id);
      if (canon) assets['kuro/canon.v1.json'] = JSON.stringify(canon);
      const drawingIds = [...new Set(memories.flatMap(record => record.assetRefs)
        .filter(ref => ref.startsWith('drawing:')).map(ref => ref.slice('drawing:'.length)))];
      let linkedDrawings = 0;
      for (const drawingId of drawingIds) {
        const drawing = await drawingStorage.load(drawingId);
        if (!drawing) continue;
        assets['kuro/drawings/' + drawingId + '.json'] = JSON.stringify(drawing);
        linkedDrawings++;
      }
      const content = serializeKuroPackage(createKuroPackage(project, assets));
      const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.kuro-canvas+json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') + '.kuro.json';
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Exported “' + project.name + '” with ' + memories.length + ' story memories, ' + (canon ? 'its World Bible' : 'no World Bible yet') + ', ' + (artDirection ? 'its Art Direction Bible' : 'no Art Direction Bible') + ', ' + (styleBible ? 'its chapter-aware Style Bible' : 'no Style Bible') + ', ' + references.length + ' reference sources, and ' + linkedDrawings + ' linked drawings.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project export failed.');
    } finally { setBusy(false); }
  }

  async function importProject(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('This file exceeds the 50 MB import limit.');
      const imported = parseKuroPackage(await file.text());
      // Give each import a fresh local identity so importing the same package cannot
      // silently overwrite a project that is already on this device.
      const project: KuroProject = {
        ...imported.project,
        id: crypto.randomUUID(),
        name: imported.project.name + ' (imported)',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const importedAssets = imported.assets;
      const now = new Date().toISOString();
      const drawingIdMap = new Map<string, string>();
      const drawings: LocalDrawingDocument[] = [];
      for (const [key, raw] of Object.entries(importedAssets)) {
        if (!key.startsWith('kuro/drawings/') || !key.endsWith('.json')) continue;
        let value: unknown;
        try { value = JSON.parse(raw); } catch { throw new Error('A bundled drawing is not valid JSON: ' + key); }
        if (!value || typeof value !== 'object') throw new Error('A bundled drawing is invalid: ' + key);
        const drawing = value as Partial<LocalDrawingDocument>;
        if (drawing.version !== 1 || typeof drawing.id !== 'string' || !Number.isFinite(drawing.width) || !Number.isFinite(drawing.height) || !Array.isArray(drawing.strokes)) {
          throw new Error('A bundled drawing has an unsupported format: ' + key);
        }
        const nextId = crypto.randomUUID();
        drawingIdMap.set(drawing.id, nextId);
        drawings.push({ ...drawing, id: nextId, name: drawing.name || 'Imported drawing', version: 1, width: drawing.width!, height: drawing.height!, background: drawing.background || '#fffdfb', strokes: drawing.strokes, updatedAt: now } as LocalDrawingDocument);
      }

      let canon: CanonBundle | undefined;
      if (importedAssets['kuro/canon.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/canon.v1.json']); } catch { throw new Error('The bundled World Bible is not valid JSON.'); }
        if (!raw || typeof raw !== 'object') throw new Error('The bundled World Bible is invalid.');
        const value = raw as Partial<CanonBundle>;
        if (value.schemaVersion !== 1 || !Array.isArray(value.entities) || !Array.isArray(value.facts)) throw new Error('The bundled World Bible has an unsupported format.');
        canon = {
          schemaVersion: 1, projectId: project.id,
          entities: value.entities.map(entity => ({ ...entity, projectId: project.id })),
          facts: value.facts.map(fact => ({ ...fact, projectId: project.id })),
        };
        const issues = validateCanon(canon).filter(issue => issue.severity === 'error');
        if (issues.length) throw new Error('The bundled World Bible failed validation: ' + issues.map(issue => issue.message).join(' '));
      }

      let artDirection: ArtDirectionBible | undefined;
      if (importedAssets['kuro/art-direction.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/art-direction.v1.json']); } catch { throw new Error('The bundled Art Direction Bible is not valid JSON.'); }
        if (!raw || typeof raw !== 'object') throw new Error('The bundled Art Direction Bible is invalid.');
        const value = raw as Partial<ArtDirectionBible>;
        artDirection = { ...value, projectId: project.id, schemaVersion: 1, influences: Array.isArray(value.influences) ? value.influences : [], updatedAt: now } as ArtDirectionBible;
        const errors = validateArtDirection(artDirection, project.id);
        if (errors.length) throw new Error('The bundled Art Direction Bible failed validation: ' + errors.join(' '));
      }

      let styleBible: ProjectStyleBible | undefined;
      if (importedAssets['kuro/style-bible.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/style-bible.v1.json']); } catch { throw new Error('The bundled Style Bible is not valid JSON.'); }
        if (!raw || typeof raw !== 'object') throw new Error('The bundled Style Bible is invalid.');
        const value = raw as Partial<ProjectStyleBible>;
        styleBible = { ...value, schemaVersion: 1, projectId: project.id, inspirations: Array.isArray(value.inspirations) ? value.inspirations : [], rules: Array.isArray(value.rules) ? value.rules : [], characterStates: Array.isArray(value.characterStates) ? value.characterStates : [], updatedAt: now } as ProjectStyleBible;
        const errors = validateStyleBible(styleBible, project.id);
        if (errors.length) throw new Error('The bundled Style Bible failed validation: ' + errors.join(' '));
      }

      let oldReferences: ReferenceSourceRecord[] = [];
      if (importedAssets['kuro/references.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/references.v1.json']); } catch { throw new Error('The bundled reference library is not valid JSON.'); }
        if (!Array.isArray(raw)) throw new Error('The bundled reference library must be a list.');
        oldReferences = raw as ReferenceSourceRecord[];
      }
      const references: ReferenceSourceRecord[] = oldReferences.map(record => ({
        ...record, id: crypto.randomUUID(), projectId: project.id, createdAt: record.createdAt || now, updatedAt: now,
      }));
      for (const reference of references) {
        const errors = validateReferenceSource(reference, project.id);
        if (errors.length) throw new Error('Bundled reference failed validation: ' + errors.join(' '));
      }

      let oldMemories: StoryMemoryRecord[] = [];
      if (importedAssets['kuro/story-memory.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/story-memory.v1.json']); } catch { throw new Error('The bundled story memory is not valid JSON.'); }
        if (!Array.isArray(raw)) throw new Error('The bundled story memory must be a list.');
        const seenMemoryIds = new Set<string>();
        for (const candidate of raw) {
          if (!candidate || typeof candidate !== 'object') throw new Error('The bundled story memory contains an invalid record.');
          const item = candidate as Partial<StoryMemoryRecord>;
          if (typeof item.id !== 'string' || !item.id.trim()) throw new Error('Every bundled memory needs a stable ID.');
          if (seenMemoryIds.has(item.id)) throw new Error('The bundled story memory contains duplicate IDs.');
          seenMemoryIds.add(item.id);
          if (!Array.isArray(item.assetRefs) || !Array.isArray(item.supersedes) || !Array.isArray(item.entityIds) || !Array.isArray(item.tags)) {
            throw new Error('A bundled memory is missing its asset, revision, entity, or tag lists.');
          }
        }
        oldMemories = raw as StoryMemoryRecord[];
      }
      const memoryIdMap = new Map(oldMemories.map(record => [record.id, crypto.randomUUID()]));
      const memories: StoryMemoryRecord[] = oldMemories.map(record => ({
        ...record,
        id: memoryIdMap.get(record.id) || crypto.randomUUID(),
        projectId: project.id,
        assetRefs: record.assetRefs.map(ref => {
          if (!ref.startsWith('drawing:')) return ref;
          const oldDrawingId = ref.slice('drawing:'.length);
          const nextDrawingId = drawingIdMap.get(oldDrawingId);
          return nextDrawingId ? 'drawing:' + nextDrawingId : 'unavailable-drawing:' + oldDrawingId;
        }),
        supersedes: record.supersedes.map(oldId => memoryIdMap.get(oldId) || oldId),
        createdAt: record.createdAt || now, updatedAt: now,
      }));
      for (const memory of memories) {
        const errors = validateStoryMemoryRecord(memory, project.id);
        if (errors.length) throw new Error('Bundled story memory failed validation: ' + errors.join(' '));
      }

      const savedDrawingIds: string[] = [];
      let projectSaved = false;
      try {
        await projectStorage.save(project); projectSaved = true;
        if (canon) await canonStorage.save(canon);
        if (artDirection) await artDirectionStorage.save(artDirection);
        if (styleBible) await styleBibleStorage.save(styleBible);
        for (const reference of references) await referenceSourceStorage.save(reference);
        for (const drawing of drawings) { await drawingStorage.save(drawing); savedDrawingIds.push(drawing.id); }
        for (const memory of memories) await storyMemoryStorage.save(memory);
      } catch (error) {
        await Promise.allSettled(savedDrawingIds.map(id => drawingStorage.remove(id)));
        if (projectSaved) await projectStorage.remove(project.id);
        throw error;
      }
      await refresh();
      setMessage('Imported “' + project.name + '” with ' + memories.length + ' story memories, ' + (canon ? 'its World Bible' : 'no World Bible') + ', ' + (artDirection ? 'its Art Direction Bible' : 'no Art Direction Bible') + ', ' + (styleBible ? 'its chapter-aware Style Bible' : 'no Style Bible') + ', ' + references.length + ' reference sources, and ' + drawings.length + ' linked drawings.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project import failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return <section className="project-manager">
    <div className="project-manager-head">
      <div><small>LOCAL PROJECT FILES</small><h2>Projects</h2><p>Create a local project or move its project data between devices.</p></div>
      <div className="project-manager-actions">
        <button disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={15}/> Import package</button>
        <button disabled={busy} onClick={createNew}><Plus size={15}/> New project</button>
        <input ref={inputRef} type="file" accept=".kuro.json,.json,application/json" hidden onChange={event => void importProject(event.target.files?.[0])}/>
      </div>
    </div>
    <p role="status" className="project-manager-message">{message}</p>
    {projects.length === 0 ? <div className="project-manager-empty"><FolderOpen size={24}/><b>No saved projects yet</b><span>Create a project to begin building your series bible and creative assets.</span></div> :
      <div className="project-manager-list">{projects.map(project => <article className="project-manager-row" key={project.id}>
        <span className="project-manager-icon"><FolderOpen size={18}/></span>
        <span className="project-manager-name"><b>{project.name}</b><small>Updated {new Date(project.updatedAt).toLocaleString()}</small></span>
        <button disabled={busy} onClick={() => void exportProject(project.id)}><Download size={15}/> Export</button>
      </article>)}</div>}
    <p className="project-manager-note">The <code>.kuro.json</code> package now carries project data, World Bible facts, approved and proposed story memories, and drawings explicitly linked from the Story Vault. Linked drawings are stored as editable vector data; unlinked canvases and binary reference images are not included.</p>
    <WorldStudio />
  </section>;
}
