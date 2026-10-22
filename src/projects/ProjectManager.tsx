import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { createProject, type KuroProject } from '../core/project';
import { parseKuroPackage, parseKuroArchive, serializeKuroPackage, serializeKuroArchive, createKuroPackage, downloadKuroArchive } from '../core/package';
import { artDirectionStorage, canonStorage, characterModelStorage, chatMessageStorage, characterEvolutionStorage, conversationStorage, drawingRevisionStorage, drawingStorage, projectStorage, referenceSourceStorage, relationshipStorage, storyMemoryStorage, styleBibleStorage, universeStorage, saveImportedProjectBundle, type DrawingRevision, type LocalDrawingDocument } from '../core/storage';
import { validateCanon, type CanonBundle } from '../canon/universe';
import { validateStoryMemoryRecord, type StoryMemoryRecord } from '../canon/storyMemory';
import { validateArtDirection, type ArtDirectionBible } from '../canon/artDirection';
import { validateStyleBible, type ProjectStyleBible } from '../canon/styleBible';
import { validateReferenceSource, type ReferenceSourceRecord } from '../canon/referenceScout';
import { blobToDataUrl, dataUrlToBlob, validateCharacterModel, type CharacterModelRecord } from '../canon/characterModels';
import WorldStudio from '../canon/WorldStudio';
import { collectProjectExportDrawingIds, findMissingDrawingReferences } from './exportPreflight';
import { rehomeUniversePackage, serializeUniversePackage } from '../core/universePackage';
import type { ChatMessageRecord, ConversationRecord } from '../core/universe';
import type { RelationshipRecord } from '../canon/relationshipMemory';
import type { CharacterEvolutionState } from '../canon/characterEvolution';
import { normalizeImportedResearchTasks, researchTaskStorage } from '../research/researchQueue';
import { deleteProjectWithResearch } from '../core/projectLifecycle';

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

  async function deleteProject(projectId: string, projectName: string) {
    const confirmed = globalThis.confirm(
      'Permanently delete “' + projectName + '” and its local drawings, revisions, World/Vault records, character data, conversations, and saved research? Export a backup first if you may need it. This cannot be undone.'
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteProjectWithResearch(projectId, {
        loadProject: id => projectStorage.load(id),
        listResearchTasks: id => researchTaskStorage.list(id),
        removeResearchTasks: id => researchTaskStorage.removeProject(id),
        removeProjectData: id => projectStorage.remove(id),
        restoreResearchTasks: (tasks, id) => researchTaskStorage.saveMany(tasks, id),
      });
      await refresh();
      setMessage('Deleted “' + projectName + '” and its associated local creative and research data.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project deletion failed.');
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
      const researchTasks = await researchTaskStorage.list(id);
      assets['kuro/research-tasks.v1.json'] = JSON.stringify(researchTasks);
      const artDirection = await artDirectionStorage.load(id);
      if (artDirection) assets['kuro/art-direction.v1.json'] = JSON.stringify(artDirection);
      const styleBible = await styleBibleStorage.load(id);
      if (styleBible) assets['kuro/style-bible.v1.json'] = JSON.stringify(styleBible);
      const references = await referenceSourceStorage.list(id);
      assets['kuro/references.v1.json'] = JSON.stringify(references);
      const characterModels = await characterModelStorage.list(id);
      assets['kuro/character-models.v1.json'] = JSON.stringify(await Promise.all(characterModels.map(async model => ({ ...model, modelBlob: undefined, modelDataUrl: model.modelBlob ? await blobToDataUrl(model.modelBlob) : undefined }))));
      const canon = await canonStorage.load(id);
      if (canon) assets['kuro/canon.v1.json'] = JSON.stringify(canon);

      // Export the project-bound universe and its full transcript/continuity records.
      const universes = (await universeStorage.list()).filter(universe => universe.projectId === id);
      const conversations: ConversationRecord[] = [];
      const messages: ChatMessageRecord[] = [];
      const relationships: RelationshipRecord[] = [];
      const characterStates: CharacterEvolutionState[] = [];
      for (const universe of universes) {
        const scopedConversations = await conversationStorage.list(universe.id);
        conversations.push(...scopedConversations);
        for (const conversation of scopedConversations) {
          messages.push(...await chatMessageStorage.list(universe.id, conversation.id));
        }
        relationships.push(...await relationshipStorage.list(universe.id));
        characterStates.push(...await characterEvolutionStorage.list(universe.id));
      }
      Object.assign(assets, serializeUniversePackage({ universes, conversations, messages, relationships, characterStates }));

      const availableDrawings = await drawingStorage.list(id);
      const drawingIds = collectProjectExportDrawingIds(memories, availableDrawings.map(drawing => drawing.id));
      const missingDrawings = findMissingDrawingReferences(memories, availableDrawings.map(drawing => drawing.id));
      if (missingDrawings.length) {
        const details = missingDrawings.map(item => item.drawingId + ' (referenced by ' + item.memoryTitles.join(', ') + ')').join('; ');
        throw new Error('Export cancelled to protect project completeness. These Story Vault drawings are missing: ' + details + '. Recover or remove the broken references, then export again.');
      }
      let exportedDrawings = 0;
      let exportedRevisions = 0;
      for (const drawingId of drawingIds) {
        const drawing = await drawingStorage.load(drawingId, id);
        if (!drawing) throw new Error('Export cancelled because drawing "' + drawingId + '" disappeared during packaging. Nothing was downloaded; retry after checking local storage.');
        assets['kuro/drawings/' + drawingId + '.json'] = JSON.stringify(drawing);
        exportedDrawings++;
        const revisionMetas = await drawingRevisionStorage.list(drawingId);
        for (const meta of revisionMetas) {
          const revision = await drawingRevisionStorage.load(meta.id, drawingId);
          if (!revision) throw new Error('Export cancelled because revision "' + meta.id + '" of drawing "' + drawingId + '" disappeared during packaging. Nothing was downloaded; retry after checking local storage.');
          assets['kuro/drawing-revisions/' + drawingId + '/' + revision.id + '.json'] = JSON.stringify(revision);
          exportedRevisions++;
        }
      }
      const content = serializeKuroArchive(createKuroPackage(project, assets));
      downloadKuroArchive(content, project.name);
      setMessage('Exported “' + project.name + '” with ' + memories.length + ' story memories, ' + (canon ? 'its World Bible' : 'no World Bible yet') + ', ' + (artDirection ? 'its Art Direction Bible' : 'no Art Direction Bible') + ', ' + (styleBible ? 'its chapter-aware Style Bible' : 'no Style Bible') + ', ' + references.length + ' reference sources, ' + characterModels.length + ' 3D character models, ' + exportedDrawings + ' saved drawings and ' + exportedRevisions + ' revision checkpoints, ' + universes.length + ' universes, ' + conversations.length + ' conversations, ' + messages.length + ' chat messages, ' + relationships.length + ' relationship records, and ' + characterStates.length + ' character timeline states.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project export failed.');
    } finally { setBusy(false); }
  }

  async function importProject(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('This file exceeds the 50 MB import limit.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      const imported = isZip ? parseKuroArchive(bytes) : parseKuroPackage(await file.text());
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
      const drawingRevisions: DrawingRevision[] = [];
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
        drawings.push({ ...drawing, id: nextId, projectId: project.id, name: drawing.name || 'Imported drawing', version: 1, width: drawing.width!, height: drawing.height!, background: drawing.background || '#fffdfb', strokes: drawing.strokes, updatedAt: now } as LocalDrawingDocument);
      }
      const seenRevisionIds = new Set<string>();
      for (const [key, raw] of Object.entries(importedAssets)) {
        if (!key.startsWith('kuro/drawing-revisions/') || !key.endsWith('.json')) continue;
        let value: unknown;
        try { value = JSON.parse(raw); } catch { throw new Error('A bundled drawing revision is not valid JSON: ' + key); }
        if (!value || typeof value !== 'object') throw new Error('A bundled drawing revision is invalid: ' + key);
        const revision = value as Partial<DrawingRevision>;
        if (typeof revision.id !== 'string' || !revision.id.trim() || typeof revision.drawingId !== 'string'
          || !revision.document || typeof revision.document !== 'object' || revision.document.version !== 1
          || revision.document.id !== revision.drawingId || !Array.isArray(revision.document.strokes)
          || !Number.isFinite(revision.document.width) || !Number.isFinite(revision.document.height)) {
          throw new Error('A bundled drawing revision has an unsupported format: ' + key);
        }
        if (seenRevisionIds.has(revision.id)) throw new Error('The package contains duplicate drawing revision IDs.');
        seenRevisionIds.add(revision.id);
        const nextDrawingId = drawingIdMap.get(revision.drawingId);
        if (!nextDrawingId) throw new Error('A drawing revision references a drawing missing from the package: ' + revision.drawingId);
        drawingRevisions.push({
          id: crypto.randomUUID(),
          drawingId: nextDrawingId,
          title: typeof revision.title === 'string' && revision.title.trim() ? revision.title : 'Imported checkpoint',
          createdAt: typeof revision.createdAt === 'string' ? revision.createdAt : now,
          document: {
            ...revision.document,
            id: nextDrawingId,
            projectId: project.id,
            version: 1,
            width: revision.document.width!,
            height: revision.document.height!,
            background: revision.document.background || '#fffdfb',
            strokes: revision.document.strokes,
            updatedAt: now,
          } as LocalDrawingDocument,
        });
      }
      const universePackage = rehomeUniversePackage(importedAssets, project.id, drawingIdMap);

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

      let oldCharacterModels: Array<Record<string, unknown>> = [];
      if (importedAssets['kuro/character-models.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/character-models.v1.json']); } catch { throw new Error('The bundled 3D character models are not valid JSON.'); }
        if (!Array.isArray(raw)) throw new Error('The bundled 3D character models must be a list.');
        oldCharacterModels = raw as Array<Record<string, unknown>>;
      }
      const characterModels: CharacterModelRecord[] = oldCharacterModels.map(raw => {
        const { modelDataUrl, ...metadata } = raw;
        const modelBlob = typeof modelDataUrl === 'string' ? dataUrlToBlob(modelDataUrl) : undefined;
        return { ...metadata, id: crypto.randomUUID(), projectId: project.id, modelBlob, createdAt: typeof metadata.createdAt === 'string' ? metadata.createdAt : now, updatedAt: now } as CharacterModelRecord;
      });
      for (const model of characterModels) {
        const errors = validateCharacterModel(model, project.id);
        if (errors.length) throw new Error('Bundled 3D character model failed validation: ' + errors.join(' '));
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

      let researchTasks: ReturnType<typeof normalizeImportedResearchTasks> = [];
      if (importedAssets['kuro/research-tasks.v1.json']) {
        let raw: unknown;
        try { raw = JSON.parse(importedAssets['kuro/research-tasks.v1.json']); }
        catch { throw new Error('The bundled research task history is not valid JSON.'); }
        researchTasks = normalizeImportedResearchTasks(raw, imported.project.id, project.id, () => crypto.randomUUID(), now);
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

      // Research uses its own IndexedDB database, so compensate if the main project
      // transaction fails. The restored records are already normalized and validated.
      await researchTaskStorage.saveMany(researchTasks, project.id);
      try {
        await saveImportedProjectBundle({
          project, canon, artDirection, styleBible, references, characterModels, drawings, drawingRevisions, memories,
          ...universePackage,
        });
      } catch (error) {
        try {
          await researchTaskStorage.removeProject(project.id);
        } catch (cleanupError) {
          const importMessage = error instanceof Error ? error.message : 'Unknown project import failure.';
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'Unknown research cleanup failure.';
          throw new Error(
            'Project import failed: ' + importMessage
            + '. Cleanup of research records for the incomplete import also failed: ' + cleanupMessage
            + '. Check local research history before retrying so orphaned records can be recovered.'
          );
        }
        throw error;
      }
      await refresh();
      setMessage('Imported “' + project.name + '” with ' + memories.length + ' story memories, ' + (canon ? 'its World Bible' : 'no World Bible') + ', ' + (artDirection ? 'its Art Direction Bible' : 'no Art Direction Bible') + ', ' + (styleBible ? 'its chapter-aware Style Bible' : 'no Style Bible') + ', ' + references.length + ' reference sources, ' + characterModels.length + ' 3D character models, ' + drawings.length + ' drawings and ' + drawingRevisions.length + ' revision checkpoints, ' + universePackage.universes.length + ' universes, ' + universePackage.conversations.length + ' conversations, ' + universePackage.messages.length + ' chat messages, ' + universePackage.relationships.length + ' relationship records, and ' + universePackage.characterStates.length + ' character timeline states, and ' + researchTasks.length + ' saved research tasks (unfinished tasks are paused for manual retry).');
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
        <input ref={inputRef} type="file" accept=".kuro,.kuro.json,.json,application/json" hidden onChange={event => void importProject(event.target.files?.[0])}/>
      </div>
    </div>
    <p role="status" className="project-manager-message">{message}</p>
    {projects.length === 0 ? <div className="project-manager-empty"><FolderOpen size={24}/><b>No saved projects yet</b><span>Create a project to begin building your series bible and creative assets.</span></div> :
      <div className="project-manager-list">{projects.map(project => <article className="project-manager-row" key={project.id}>
        <span className="project-manager-icon"><FolderOpen size={18}/></span>
        <span className="project-manager-name"><b>{project.name}</b><small>Updated {new Date(project.updatedAt).toLocaleString()}</small></span>
        <button disabled={busy} onClick={() => void exportProject(project.id)}><Download size={15}/> Export</button>
        <button disabled={busy} title="Permanently delete this project and its owned local data" aria-label={'Delete project ' + project.name} onClick={() => void deleteProject(project.id, project.name)}><Trash2 size={15}/> Delete</button>
      </article>)}</div>}
    <p className="project-manager-note">The <code>.kuro</code> archive carries the World Bible, research notes and source excerpts, approved/proposed story memories, timelines, character models, all saved project canvases (including those not linked from Story Vault), drawing revisions and universe transcripts. Legacy <code>.kuro.json</code> backups can still be imported. Completed research travels with its sources; unfinished research is imported paused. Reference URLs and attribution metadata are preserved, but source image files are not embedded and need to be fetched again. ZIP entries are checksummed but stored without compression under a 50 MB limit.</p>
    <WorldStudio />
  </section>;
}
