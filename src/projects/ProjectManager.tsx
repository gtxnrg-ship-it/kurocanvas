import { useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Plus, Upload } from 'lucide-react';
import { createProject, type KuroProject } from '../core/project';
import { parseKuroPackage, serializeKuroPackage, createKuroPackage } from '../core/package';
import { projectStorage } from '../core/storage';
import WorldStudio from '../canon/WorldStudio';

type ProjectSummary = Pick<KuroProject, 'id' | 'name' | 'createdAt' | 'updatedAt'>;

export default function ProjectManager() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Projects and package files stay on this device.');
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try { setProjects(await projectStorage.list()); }
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
      const content = serializeKuroPackage(createKuroPackage(project));
      const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.kuro-canvas+json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') + '.kuro.json';
      anchor.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Exported “' + project.name + '”. Artwork files are not embedded yet.');
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
      await projectStorage.save(project);
      await refresh();
      setMessage('Imported “' + project.name + '”. Review it in your local project list.');
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
    <p className="project-manager-note">Current package format is <code>.kuro.json</code>. It includes project metadata, templates, and asset records; it does not yet bundle drawing pixels or binary reference images into a ZIP archive.</p>
    <WorldStudio />
  </section>;
}
