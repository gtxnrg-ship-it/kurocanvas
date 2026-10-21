import { useEffect, useState } from "react";
import { ArrowRight, Archive, Check, RefreshCw } from "lucide-react";
import { drawingStorage } from "../core/storage";

type LegacyDrawing = {id:string;name?:string;updatedAt:string};
export default function LegacyDrawingMigration({projectId}:{projectId:string}){
 const [items,setItems]=useState<LegacyDrawing[]>([]);const [notice,setNotice]=useState("");const [busyId,setBusyId]=useState("");
 async function reload(){setItems(await drawingStorage.listUnassigned());}
 useEffect(()=>{let alive=true;void drawingStorage.listUnassigned().then(value=>{if(alive)setItems(value);}).catch(error=>{if(alive)setNotice(error instanceof Error?error.message:"Could not inspect legacy drawings.");});return()=>{alive=false;};},[]);
 async function migrate(item:LegacyDrawing){if(!projectId){setNotice("Open a universe before migrating legacy drawings.");return;}setBusyId(item.id);setNotice("");try{await drawingStorage.migrateLegacyToProject(item.id,projectId);await reload();setNotice("“"+(item.name||"Untitled drawing")+"” is now part of the current universe.");}catch(error){setNotice(error instanceof Error?error.message:"Could not migrate the drawing.");}finally{setBusyId("");}}
 if(!items.length&&!notice)return null;
 return <section className="legacy-migration"><div className="legacy-migration-head"><span><Archive size={15}/></span><div><b>Unassigned legacy drawings</b><p>Older drawings predate universe isolation. They remain hidden from Kuro until you explicitly move them into a universe.</p></div><button onClick={()=>void reload()} aria-label="Refresh legacy drawings"><RefreshCw size={13}/></button></div>
  {items.map(item=><div className="legacy-migration-row" key={item.id}><div><b>{item.name||"Untitled drawing"}</b><small>Last saved {new Date(item.updatedAt).toLocaleDateString()}</small></div><button disabled={!!busyId} onClick={()=>void migrate(item)}>{busyId===item.id?"Moving…":<>Move into this universe <ArrowRight size={12}/></>}</button></div>)}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
