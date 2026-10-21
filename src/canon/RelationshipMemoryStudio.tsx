import { useEffect, useState } from "react";
import { ArrowRight, Check, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { canonStorage, chatMessageStorage, relationshipStorage } from "../core/storage";
import { proposeRelationshipTransition, type RelationshipRecord, type RelationshipSnapshot, type RelationshipState } from "./relationshipMemory";
import type { CanonEntity } from "./universe";
import type { ChatMessageRecord } from "../core/universe";

const states: RelationshipState[] = ["strangers","acquaintances","allies","friends","close-friends","rivals","enemies","estranged","romantic","family","custom"];
const initialSnapshot = (): RelationshipSnapshot => ({state:"strangers",trust:10,warmth:10,tension:10,emotionalNotes:[],interactionPattern:[],boundaries:[],unresolvedWounds:[]});
const lines = (value:string) => value.split("\n").map(item=>item.trim()).filter(Boolean);

export default function RelationshipMemoryStudio({universeId,projectId,conversationId}:{universeId:string;projectId:string;conversationId:string}){
 const [records,setRecords]=useState<RelationshipRecord[]>([]);\n const [sourceMessages,setSourceMessages]=useState<ChatMessageRecord[]>([]);\n const [selectedSourceIds,setSelectedSourceIds]=useState<string[]>([]);
 const [characters,setCharacters]=useState<CanonEntity[]>([]);
 const [characterAId,setCharacterAId]=useState("");
 const [characterBId,setCharacterBId]=useState("");
 const [state,setState]=useState<RelationshipState>("strangers");
 const [trust,setTrust]=useState(10);const [warmth,setWarmth]=useState(10);const [tension,setTension]=useState(10);
 const [emotionalNotes,setEmotionalNotes]=useState("");const [interactionPattern,setInteractionPattern]=useState("");const [boundaries,setBoundaries]=useState("");const [unresolvedWounds,setUnresolvedWounds]=useState("");
 const [selectedId,setSelectedId]=useState("");const [nextState,setNextState]=useState<RelationshipState>("friends");
 const [storyOrder,setStoryOrder]=useState("1");const [eventTitle,setEventTitle]=useState("");const [eventSummary,setEventSummary]=useState("");const [eventCause,setEventCause]=useState("");const [sourceIds,setSourceIds]=useState("");
 const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
 async function reload(){if(!universeId||!projectId)return;const [saved,canon,messages]=await Promise.all([relationshipStorage.list(universeId),canonStorage.load(projectId),conversationId?chatMessageStorage.list(universeId,conversationId):Promise.resolve([])]);setRecords(saved);setCharacters((canon?.entities??[]).filter(entity=>entity.kind.toLocaleLowerCase().includes("character")&&entity.status==="approved"));setSourceMessages(messages.slice(-40).reverse());setSelectedId(current=>saved.some(item=>item.id===current)?current:(saved[0]?.id??""));}
 useEffect(()=>{let alive=true;void (async()=>{try{await reload();}catch(error){if(alive)setNotice(error instanceof Error?error.message:"Could not load relationship memory.");}})();return()=>{alive=false;};},[universeId,projectId,conversationId]);
 const selected=records.find(item=>item.id===selectedId);
 function name(id:string){return characters.find(item=>item.id===id)?.name??id;}
 async function createRelationship(){
  if(!characterAId||!characterBId||characterAId===characterBId){setNotice("Choose two different approved characters first.");return;}
  if(records.some(item=>[item.characterAId,item.characterBId].includes(characterAId)&&[item.characterAId,item.characterBId].includes(characterBId))){setNotice("A relationship for this character pair already exists in this universe.");return;}
  const snapshot:RelationshipSnapshot={state,trust,warmth,tension,emotionalNotes:lines(emotionalNotes),interactionPattern:lines(interactionPattern),boundaries:lines(boundaries),unresolvedWounds:lines(unresolvedWounds)};
  if(state==="custom"){setNotice("Custom relationship states need a named label; choose a defined state for now.");return;}
  const id=crypto.randomUUID();const now=new Date().toISOString();
  const baseline={id:crypto.randomUUID(),universeId,relationshipId:id,storyOrder:0,occurredAt:now,title:"Initial relationship baseline",summary:"Initial relationship state recorded in Relationship Memory Studio.",cause:"User-entered baseline",consequences:[],sourceMessageIds:[],canonStatus:"approved" as const,before:snapshot,after:snapshot};
  const record:RelationshipRecord={schemaVersion:1,id,universeId,characterAId,characterBId,directional:false,current:snapshot,history:[baseline],updatedAt:now};
  setBusy(true);try{await relationshipStorage.save(record);setNotice("Relationship saved in this universe.");setCharacterAId("");setCharacterBId("");await reload();setSelectedId(id);}catch(error){setNotice(error instanceof Error?error.message:"Could not save relationship.");}finally{setBusy(false);}
 }
 async function propose(){
  if(!selected){setNotice("Choose a relationship first.");return;}
  const sources=selectedSourceIds;
  const order=Number(storyOrder);
  if(!Number.isFinite(order)||order<=Math.max(-1,...selected.history.map(item=>item.storyOrder))){setNotice("Story order must be later than the existing relationship history.");return;}
  if(!eventTitle.trim()||!eventSummary.trim()||!eventCause.trim()||!sources.length){setNotice("A transition needs a title, summary, cause, and one or more source message IDs.");return;}
  const after:RelationshipSnapshot={...selected.current,state:nextState,customState:undefined};
  try{
   const event=proposeRelationshipTransition(selected,{title:eventTitle,summary:eventSummary,cause:eventCause,sourceMessageIds:sources,storyOrder:order,after},()=>crypto.randomUUID());
   await relationshipStorage.save({...selected,history:[...selected.history,event],updatedAt:new Date().toISOString()});
   setNotice("Transition saved as PROPOSED. It does not affect Kuro's canon until you approve it.");setEventTitle("");setEventSummary("");setEventCause("");setSelectedSourceIds([]);await reload();
  }catch(error){setNotice(error instanceof Error?error.message:"Could not create relationship proposal.");}
 }
 async function approve(eventId:string){
  if(!selected)return;
  const event=selected.history.find(item=>item.id===eventId);if(!event||event.canonStatus!=="proposed")return;
  const history=selected.history.map(item=>item.id===eventId?{...item,canonStatus:"approved" as const}:item);
  try{await relationshipStorage.save({...selected,current:event.after,history,updatedAt:new Date().toISOString()});setNotice("Transition approved. Current behavior updates; prior history remains intact.");await reload();}catch(error){setNotice(error instanceof Error?error.message:"Could not approve the transition.");}
 }
 return <section className="relationship-studio">
  <div className="relationship-studio-head"><div><span>UNIVERSE-SCOPED CANON</span><h2>Relationship memory</h2><p>Track emotional continuity without erasing how the characters got here.</p></div><button onClick={()=>void reload()} aria-label="Refresh relationship memory"><RefreshCw size={14}/></button></div>
  <div className="relationship-columns">
   <div className="relationship-create">
    <h3><Plus size={14}/> Record a relationship</h3>
    {characters.length<2?<p className="relationship-empty">Add and approve at least two character entities in this universe's World Bible before creating a relationship.</p>:<>
     <label>Character A<select value={characterAId} onChange={e=>setCharacterAId(e.target.value)}><option value="">Choose character</option>{characters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <label>Character B<select value={characterBId} onChange={e=>setCharacterBId(e.target.value)}><option value="">Choose character</option>{characters.filter(item=>item.id!==characterAId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
     <label>Current relationship<select value={state} onChange={e=>setState(e.target.value as RelationshipState)}>{states.filter(item=>item!=="custom").map(item=><option key={item} value={item}>{item.replace(/-/g," ")}</option>)}</select></label>
     <div className="relationship-range-grid"><label>Trust <b>{trust}</b><input type="range" min="0" max="100" value={trust} onChange={e=>setTrust(Number(e.target.value))}/></label><label>Warmth <b>{warmth}</b><input type="range" min="0" max="100" value={warmth} onChange={e=>setWarmth(Number(e.target.value))}/></label><label>Tension <b>{tension}</b><input type="range" min="0" max="100" value={tension} onChange={e=>setTension(Number(e.target.value))}/></label></div>
     <label>Emotional notes <textarea rows={2} value={emotionalNotes} onChange={e=>setEmotionalNotes(e.target.value)} placeholder="One note per line: fears, affection, guilt…"/></label>
     <label>Interaction patterns <textarea rows={2} value={interactionPattern} onChange={e=>setInteractionPattern(e.target.value)} placeholder="Recurring jokes, habits, ways they speak…"/></label>
     <label>Boundaries <textarea rows={2} value={boundaries} onChange={e=>setBoundaries(e.target.value)} placeholder="What hurts, what is off-limits…"/></label>
     <label>Unresolved wounds <textarea rows={2} value={unresolvedWounds} onChange={e=>setUnresolvedWounds(e.target.value)} placeholder="Betrayals or conflicts that still matter…"/></label>
     <button className="relationship-primary" disabled={busy} onClick={()=>void createRelationship()}><Plus size={14}/> Save relationship baseline</button>
    </>}
   </div>
   <div className="relationship-list">
    <h3>Saved relationships <span>{records.length}</span></h3>
    {!records.length?<p className="relationship-empty">No relationship records yet. Saved records are isolated to this universe.</p>:<>
     <label>Relationship<select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>{records.map(item=><option key={item.id} value={item.id}>{name(item.characterAId)} ↔ {name(item.characterBId)}</option>)}</select></label>
     {selected&&<><div className="relationship-current"><div><small>CURRENT CANON</small><b>{name(selected.characterAId)} ↔ {name(selected.characterBId)}</b><span>{selected.current.state.replace(/-/g," ")} · trust {selected.current.trust} · warmth {selected.current.warmth} · tension {selected.current.tension}</span></div><ShieldAlert size={17}/></div>
      <div className="relationship-notes">{selected.current.emotionalNotes.map((item,i)=><p key={"e"+i}>♥ {item}</p>)}{selected.current.interactionPattern.map((item,i)=><p key={"i"+i}>↔ {item}</p>)}{selected.current.boundaries.map((item,i)=><p key={"b"+i}>◇ Boundary: {item}</p>)}{selected.current.unresolvedWounds.map((item,i)=><p key={"w"+i}>! Unresolved: {item}</p>)}</div>
      <div className="relationship-proposal"><h4>Propose a future transition</h4><p>Evidence-backed proposals stay separate from canon until approved.</p>
       <label>New state<select value={nextState} onChange={e=>setNextState(e.target.value as RelationshipState)}>{states.filter(item=>item!=="custom").map(item=><option key={item} value={item}>{item.replace(/-/g," ")}</option>)}</select></label>
       <label>Story order<input type="number" min="1" value={storyOrder} onChange={e=>setStoryOrder(e.target.value)}/></label>
       <label>Event title<input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} placeholder="The night they reconcile"/></label>
       <label>What happened?<textarea rows={2} value={eventSummary} onChange={e=>setEventSummary(e.target.value)} placeholder="Only record details supported by the source…"/></label>
       <label>Cause and emotional consequence<textarea rows={2} value={eventCause} onChange={e=>setEventCause(e.target.value)} placeholder="Why the relationship changes"/></label>
       <div className="relationship-evidence"><b>Source evidence from this conversation</b><small>Select the actual messages supporting this change. Kuro will not treat unselected conversation text as proof.</small>{sourceMessages.length===0?<p>No saved messages are available in this conversation yet.</p>:sourceMessages.map(message=><label key={message.id} className="relationship-evidence-item"><input type="checkbox" checked={selectedSourceIds.includes(message.id)} onChange={e=>setSelectedSourceIds(current=>e.target.checked?[...current,message.id]:current.filter(id=>id!==message.id))}/><span><b>{message.role==="user"?"You":"Kuro"} · {new Date(message.createdAt).toLocaleDateString()}</b><small>{message.content.slice(0,190)}{message.content.length>190?"…":""}</small></span></label>)}</div>
       <button className="relationship-primary" onClick={()=>void propose()}>Save as proposal <ArrowRight size={14}/></button>
      </div>
      <div className="relationship-history"><h4>Relationship history</h4>{[...selected.history].sort((a,b)=>a.storyOrder-b.storyOrder).map(event=><div className="relationship-event" key={event.id}><div><b>#{event.storyOrder} · {event.title}</b><small>{event.canonStatus.toUpperCase()}</small></div><p>{event.summary}</p>{event.canonStatus==="proposed"&&<button onClick={()=>void approve(event.id)}><Check size={13}/> Approve transition</button>}</div>)}</div>
     </>}
    </>}
   </div>
  </div>
  {notice&&<p className="relationship-notice" role="status">{notice}</p>}
 </section>;
}
