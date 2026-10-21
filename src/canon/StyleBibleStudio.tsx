import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Plus, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { styleBibleStorage } from "../core/storage";
import { createEmptyStyleBible, findStyleConflicts, type CharacterVisualState, type InspirationAspect, type ProjectStyleBible, type StyleInspiration, type StyleRule } from "./styleBible";

type Props = { projectId: string };
const aspects: Array<{value:InspirationAspect;label:string}> = [
  {value:"relationship-comedy",label:"Relationship / comedy"}, {value:"linework",label:"Linework"},
  {value:"color",label:"Color"}, {value:"character-design",label:"Character design"},
  {value:"group-dynamics",label:"Group dynamics"}, {value:"pacing",label:"Pacing"},
  {value:"lighting",label:"Lighting"}, {value:"composition",label:"Composition"}, {value:"other",label:"Other"},
];
const categories: StyleRule["category"][] = ["linework","palette","lighting","anatomy","rendering","composition","continuity","avoid"];
const newId = () => crypto.randomUUID();

export default function StyleBibleStudio({projectId}:Props) {
  const [bible,setBible] = useState<ProjectStyleBible|null>(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("Choose a project to define a locked, consistent visual identity.");
  const [title,setTitle] = useState("Project Style Bible");
  const [summary,setSummary] = useState("");
  const [work,setWork] = useState("");
  const [aspect,setAspect] = useState<InspirationAspect>("linework");
  const [sourceNotes,setSourceNotes] = useState("");
  const [sourceUrl,setSourceUrl] = useState("");
  const [ruleCategory,setRuleCategory] = useState<StyleRule["category"]>("continuity");
  const [ruleText,setRuleText] = useState("");
  const [characterName,setCharacterName] = useState("");
  const [storyOrder,setStoryOrder] = useState("1");
  const [chapterLabel,setChapterLabel] = useState("Chapter 1");
  const [age,setAge] = useState("");
  const [hair,setHair] = useState("");
  const [eyes,setEyes] = useState("");
  const [face,setFace] = useState("");
  const [outfit,setOutfit] = useState("");
  const [body,setBody] = useState("");
  const [scars,setScars] = useState("");
  const [accessories,setAccessories] = useState("");

  useEffect(() => {
    let live = true;
    if (!projectId) { setBible(null); setNotice("Choose or create a project in Creative Vault first."); return () => {live=false;}; }
    setBusy(true);
    styleBibleStorage.load(projectId).then(saved => {
      if (!live) return;
      const next = saved ?? createEmptyStyleBible(projectId);
      setBible(next); setTitle(next.title); setSummary(next.styleSummary);
      setNotice(saved ? "Loaded this project's local style bible." : "Start with a visual direction, then approve each rule and reference before Kuro uses it.");
    }).catch(error => { if(live) setNotice(error instanceof Error ? error.message : "Could not load style bible."); })
      .finally(() => { if(live) setBusy(false); });
    return () => {live=false;};
  },[projectId]);

  async function persist(next:ProjectStyleBible,message:string) {
    setBusy(true);
    try {
      await styleBibleStorage.save(next);
      setBible(next); setNotice(message);
    } catch(error) { setNotice(error instanceof Error ? error.message : "Could not save style bible."); }
    finally { setBusy(false); }
  }
  async function saveSummary(approve:boolean) {
    if(!bible) return;
    const next = {...bible,title:title.trim()||"Project Style Bible",styleSummary:summary.trim(),styleSummaryStatus:approve?"approved":bible.styleSummaryStatus,approvedVersion:bible.approvedVersion+(approve?1:0),updatedAt:new Date().toISOString()};
    await persist(next,approve?"Style summary approved and versioned.":"Style summary saved as a draft; Kuro will not treat it as a locked style.");
  }
  async function addInspiration() {
    if(!bible) return;
    if(!work.trim()||!sourceNotes.trim()) {setNotice("Add the work title and explain exactly which high-level aspect you want to learn from.");return;}
    const item:StyleInspiration={id:newId(),work:work.trim(),aspect,notes:sourceNotes.trim(),...(sourceUrl.trim()?{sourceUrl:sourceUrl.trim()}:{}),status:"proposed"};
    await persist({...bible,inspirations:[...bible.inspirations,item],updatedAt:new Date().toISOString()},"Reference added as a proposal. Approve it only after checking the source and its specific aspect.");
    setWork("");setSourceNotes("");setSourceUrl("");
  }
  async function addRule() {
    if(!bible) return;
    if(!ruleText.trim()) {setNotice("Write a concrete, testable visual rule first.");return;}
    const item:StyleRule={id:newId(),category:ruleCategory,rule:ruleText.trim(),status:"proposed"};
    await persist({...bible,rules:[...bible.rules,item],updatedAt:new Date().toISOString()},"Style rule saved as a proposal.");
    setRuleText("");
  }
  async function addState() {
    if(!bible) return;
    if(!characterName.trim()||!Number.isFinite(Number(storyOrder))) {setNotice("Character name and a numeric story order are required.");return;}
    const item:CharacterVisualState={id:newId(),characterName:characterName.trim(),storyOrder:Number(storyOrder),chapterLabel:chapterLabel.trim()||undefined,age:age.trim()||undefined,hair:hair.trim()||undefined,eyes:eyes.trim()||undefined,face:face.trim()||undefined,outfit:outfit.trim()||undefined,body:body.trim()||undefined,scars:scars.trim()||undefined,accessories:accessories.trim()||undefined,status:"proposed"};
    await persist({...bible,characterStates:[...bible.characterStates,item],updatedAt:new Date().toISOString()},"Character appearance saved as a proposed time-specific state.");
    setCharacterName("");setAge("");setHair("");setEyes("");setFace("");setOutfit("");setBody("");setScars("");setAccessories("");
  }
  async function approveRecord(collection:"inspirations"|"rules"|"characterStates",id:string) {
    if(!bible) return;
    const next={...bible,[collection]:bible[collection].map(item=>item.id===id?{...item,status:"approved" as const}:item),approvedVersion:bible.approvedVersion+1,updatedAt:new Date().toISOString()};
    await persist(next,"Approved and versioned. This record can now guide Kuro's generation.");
  }
  async function removeRecord(collection:"inspirations"|"rules"|"characterStates",id:string) {
    if(!bible) return;
    await persist({...bible,[collection]:bible[collection].filter(item=>item.id!==id),updatedAt:new Date().toISOString()},"Removed the selected style record.");
  }
  const conflicts=useMemo(()=>bible?findStyleConflicts(bible):[],[bible]);
  if(!projectId) return <section className="style-bible"><h2>Style Bible & Visual Continuity</h2><p>Choose a project to create its locked visual identity and temporal character look history.</p></section>;
  if(!bible) return <section className="style-bible"><p>{busy?"Loading project style bible…":notice}</p></section>;
  return <section className="style-bible">
    <div className="style-bible-head"><div><small>STYLE DNA · CHARACTER CONTINUITY</small><h2>Style Bible & Visual Continuity</h2><p>Mix story ingredients by aspect, lock the original art direction, and track how every character changes over time.</p></div><span className="style-version">v{bible.approvedVersion} · {busy?"Saving…":"Local"}</span></div>
    <div className="style-integrity"><ShieldAlert size={17}/><div><b>Continuity guard</b><p>Only approved rules, references, and character states enter Kuro's style context. Conflicting approved appearances at the same story order are flagged below.</p></div></div>
    <div className="style-section"><h3>01 · Project style direction</h3><label>Style bible name<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100}/></label><label>Describe the cohesive original look<textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={3} placeholder="e.g. crisp urban webtoon inks, expressive but consistent faces, restrained night palette, warm comedic expressions…"/></label><div className="style-actions"><button onClick={()=>saveSummary(false)} disabled={busy}><Check size={14}/> Save draft</button><button className="primary" onClick={()=>saveSummary(true)} disabled={busy||!summary.trim()}><ShieldAlert size={14}/> Approve style summary</button></div><p className="style-hint">Approval creates a versioned direction. Later changes should be intentional, not accidental chapter-to-chapter drift.</p></div>
    <div className="style-section"><h3>02 · Inspiration by aspect</h3><p className="style-hint">For example: romantic-comedy timing from Horimiya, broad urban-webtoon linework inspiration from Lookism, and ensemble/faction dynamics from Tokyo Revengers. Translate these into original rules rather than copying exact panels or character designs.</p><div className="style-form-grid"><label>Work / source title<input value={work} onChange={e=>setWork(e.target.value)} placeholder="Work title"/></label><label>Aspect<select value={aspect} onChange={e=>setAspect(e.target.value as InspirationAspect)}>{aspects.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}</select></label><label className="wide">What to take from it<textarea rows={2} value={sourceNotes} onChange={e=>setSourceNotes(e.target.value)} placeholder="Describe the technique or story quality—not a request to duplicate the work."/></label><label className="wide">Source URL (optional, HTTPS)<input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://…"/></label></div><button onClick={addInspiration} disabled={busy}><Plus size={14}/> Add inspiration proposal</button><div className="style-record-list">{bible.inspirations.map(item=><article key={item.id}><div><span className="style-chip">{aspects.find(a=>a.value===item.aspect)?.label}</span><b>{item.work}</b><p>{item.notes}</p>{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer"><Link2 size={12}/> Open source</a>}<small>{item.status}</small></div><div className="style-record-actions">{item.status==="proposed"&&<button onClick={()=>approveRecord("inspirations",item.id)}><Check size={13}/> Approve</button>}<button onClick={()=>removeRecord("inspirations",item.id)}>Remove</button></div></article>)}</div></div>
    <div className="style-section"><h3>03 · Locked visual rules</h3><div className="style-form-grid"><label>Category<select value={ruleCategory} onChange={e=>setRuleCategory(e.target.value as StyleRule["category"])}>{categories.map(v=><option key={v}>{v}</option>)}</select></label><label className="wide">Rule<textarea rows={2} value={ruleText} onChange={e=>setRuleText(e.target.value)} placeholder="e.g. Ink width stays consistent; scars persist after their introduction unless story canon explicitly changes them."/></label></div><button onClick={addRule} disabled={busy}><Plus size={14}/> Add rule proposal</button><div className="style-record-list">{bible.rules.map(item=><article key={item.id}><div><span className="style-chip">{item.category}</span><p>{item.rule}</p><small>{item.status}</small></div><div className="style-record-actions">{item.status==="proposed"&&<button onClick={()=>approveRecord("rules",item.id)}><Check size={13}/> Approve</button>}<button onClick={()=>removeRecord("rules",item.id)}>Remove</button></div></article>)}</div></div>
    <div className="style-section"><h3>04 · Character look history</h3><p className="style-hint">Each entry is a point in story time. Record age, hair, scars and accessories when they change. Earlier chapters should never inherit future changes.</p><div className="style-form-grid"><label>Character name<input value={characterName} onChange={e=>setCharacterName(e.target.value)} placeholder="Character name"/></label><label>Story order<input type="number" min="0" value={storyOrder} onChange={e=>setStoryOrder(e.target.value)}/></label><label>Chapter / scene<input value={chapterLabel} onChange={e=>setChapterLabel(e.target.value)} placeholder="Chapter 1 · Scene 2"/></label><label>Age at this point<input value={age} onChange={e=>setAge(e.target.value)} placeholder="17"/></label><label>Hair style & length<input value={hair} onChange={e=>setHair(e.target.value)} placeholder="Short black undercut"/></label><label>Eyes<input value={eyes} onChange={e=>setEyes(e.target.value)} placeholder="Shape, color, notable detail"/></label><label>Face<input value={face} onChange={e=>setFace(e.target.value)} placeholder="Face shape / features"/></label><label>Outfit<input value={outfit} onChange={e=>setOutfit(e.target.value)} placeholder="Clothing at this point"/></label><label>Body / build<input value={body} onChange={e=>setBody(e.target.value)} placeholder="Height, build, posture"/></label><label>Scars / injuries<input value={scars} onChange={e=>setScars(e.target.value)} placeholder="None, or exact location and shape"/></label><label className="wide">Accessories / persistent details<input value={accessories} onChange={e=>setAccessories(e.target.value)} placeholder="Jewelry, glasses, signature item…"/></label></div><button onClick={addState} disabled={busy||!characterName.trim()}><Plus size={14}/> Add character state proposal</button><div className="style-record-list">{[...bible.characterStates].sort((a,b)=>a.storyOrder-b.storyOrder).map(item=><article key={item.id}><div><span className="style-chip">{item.chapterLabel||"Order "+item.storyOrder} · order {item.storyOrder}</span><b>{item.characterName}</b><p>{[item.age&&"Age "+item.age,item.hair&&"Hair: "+item.hair,item.eyes&&"Eyes: "+item.eyes,item.face&&"Face: "+item.face,item.outfit&&"Outfit: "+item.outfit,item.body&&"Build: "+item.body,item.scars&&"Scars: "+item.scars,item.accessories&&"Accessories: "+item.accessories].filter(Boolean).join(" · ")||"No visual details entered yet."}</p><small>{item.status}</small></div><div className="style-record-actions">{item.status==="proposed"&&<button onClick={()=>approveRecord("characterStates",item.id)}><Check size={13}/> Approve</button>}<button onClick={()=>removeRecord("characterStates",item.id)}>Remove</button></div></article>)}</div></div>
    {conflicts.length>0&&<div className="style-conflicts"><h3><ShieldAlert size={15}/> Consistency checks</h3>{conflicts.map((issue,i)=><p key={issue.code+issue.recordIds.join("-")+i} className={issue.severity}>{issue.severity==="error"?"Conflict":"Note"}: {issue.message}</p>)}</div>}
    <div className="style-bible-notice" role="status">{notice}</div>
  </section>;
}
