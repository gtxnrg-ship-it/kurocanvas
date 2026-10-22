import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ChevronDown, Save, ShieldCheck, Sparkles } from "lucide-react";
import { canonStorage, styleBibleStorage, storyMemoryStorage } from "../core/storage";
import { createEmptyCanon, type CanonBundle, type CanonEntity } from "./universe";
import { createEmptyStyleBible, type ProjectStyleBible } from "./styleBible";
import { createCharacterDesignHandoff, type CharacterDesignTraits } from "./characterDesignHandoff";
import type { StoryMemoryRecord } from "./storyMemory";
import "./characterDesignHandoff.css";

type Props = {
  projectId: string;
  drawingId: string;
  originalPrompt: string;
  onOpenVault: () => void;
};
type TraitField = keyof CharacterDesignTraits;
const visibleTraits: Array<{ key: TraitField; label: string; placeholder: string }> = [
  { key: "hair", label: "Hair", placeholder: "e.g. short silver hair with a side part" },
  { key: "eyes", label: "Eyes", placeholder: "e.g. gold eyes" },
  { key: "outfit", label: "Outfit", placeholder: "e.g. dark blue coat, brass clasps" },
];
const moreTraits: Array<{ key: TraitField; label: string; placeholder: string }> = [
  { key: "age", label: "Age", placeholder: "e.g. 19" },
  { key: "body", label: "Body / build", placeholder: "e.g. lean, athletic" },
  { key: "scars", label: "Scars", placeholder: "e.g. thin scar over the left eyebrow" },
  { key: "injuries", label: "Current injuries", placeholder: "e.g. bandaged right forearm" },
  { key: "accessories", label: "Accessories", placeholder: "e.g. silver ear cuff" },
  { key: "other", label: "Other appearance notes", placeholder: "Details you want to preserve" },
];

export default function CharacterDesignHandoff({ projectId, drawingId, originalPrompt, onOpenVault }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canon, setCanon] = useState<CanonBundle | null>(null);
  const [styleBible, setStyleBible] = useState<ProjectStyleBible | null>(null);
  const [memories, setMemories] = useState<StoryMemoryRecord[]>([]);
  const [characters, setCharacters] = useState<CanonEntity[]>([]);
  const [alreadyLinked, setAlreadyLinked] = useState<StoryMemoryRecord | null>(null);
  const [entityChoice, setEntityChoice] = useState("new");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [storyOrder, setStoryOrder] = useState("");
  const [traits, setTraits] = useState<CharacterDesignTraits>({});
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setCanon(null); setStyleBible(null); setMemories([]); setAlreadyLinked(null);
    setCharacters([]); setEntityChoice("new"); setName(""); setAliases("");
    setChapterNumber(""); setStoryOrder(""); setTraits({}); setFeedback("");
    Promise.all([
      canonStorage.load(projectId),
      styleBibleStorage.load(projectId),
      storyMemoryStorage.list(projectId),
    ]).then(([savedCanon, savedBible, savedMemories]) => {
      if (!alive) return;
      const nextCanon = savedCanon ?? createEmptyCanon(projectId);
      const nextBible = savedBible ?? createEmptyStyleBible(projectId);
      setCanon(nextCanon);
      setStyleBible(nextBible);
      setMemories(savedMemories);
      setCharacters(nextCanon.entities.filter(entity => entity.kind.toLocaleLowerCase() === "character"));
      const linked = savedMemories.find(record => record.kind === "visual-reference" && record.assetRefs.includes("drawing:" + drawingId));
      if (linked) {
        setAlreadyLinked(linked);
        setFeedback("This drawing is already linked to a World & Vault visual record.");
      }
    }).catch(error => {
      if (alive) setFeedback(error instanceof Error ? error.message : "Could not load this project's canon. Nothing has been saved.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, drawingId]);

  const selectedCharacter = entityChoice === "new" ? undefined : characters.find(item => item.id === entityChoice);
  function chooseCharacter(id: string) {
    setEntityChoice(id);
    if (id === "new") setName("");
    else {
      const entity = characters.find(item => item.id === id);
      setName(entity?.name ?? "");
      setAliases("");
    }
  }
  function changeTrait(key: TraitField, value: string) {
    setTraits(current => ({ ...current, [key]: value }));
  }

  async function saveDesign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canon || !styleBible || loading || saving || alreadyLinked) return;
    setSaving(true);
    setFeedback("");
    const previousCanon = await canonStorage.load(projectId);
    const previousBible = await styleBibleStorage.load(projectId);
    let nextMemory: StoryMemoryRecord | undefined;
    let wroteCanon = false;
    let wroteBible = false;
    let wroteMemory = false;
    try {
      const result = createCharacterDesignHandoff({
        projectId,
        drawingId,
        characterName: name,
        ...(entityChoice !== "new" ? { existingEntityId: entityChoice } : {}),
        aliases: aliases.split(",").map(alias => alias.trim()).filter(Boolean),
        ...(chapterNumber.trim() ? { chapterNumber: Number(chapterNumber) } : {}),
        ...(storyOrder.trim() ? { storyOrder: Number(storyOrder) } : {}),
        traits,
      }, { canon, styleBible, storyMemories: memories });
      nextMemory = result.storyMemory;
      await canonStorage.save(result.canon); wroteCanon = true;
      await styleBibleStorage.save(result.styleBible); wroteBible = true;
      await storyMemoryStorage.save(result.storyMemory); wroteMemory = true;
      setCanon(result.canon); setStyleBible(result.styleBible); setMemories(current => [...current, result.storyMemory]);
      setCharacters(result.canon.entities.filter(entity => entity.kind.toLocaleLowerCase() === "character"));
      setAlreadyLinked(result.storyMemory);
      setFeedback("Saved as a proposal, not approved canon. The drawing, character entry, and visual state are linked in this project.");
    } catch (error) {
      const rollbackErrors: string[] = [];
      if (wroteMemory && nextMemory) {
        try { await storyMemoryStorage.remove(nextMemory.id, projectId); } catch { rollbackErrors.push("story memory"); }
      }
      if (wroteBible) {
        try { if (previousBible) await styleBibleStorage.save(previousBible); else await styleBibleStorage.remove(projectId); }
        catch { rollbackErrors.push("visual bible"); }
      }
      if (wroteCanon) {
        try { if (previousCanon) await canonStorage.save(previousCanon); else await canonStorage.remove(projectId); }
        catch { rollbackErrors.push("world bible"); }
      }
      setFeedback("The complete hand-off did not finish: " + (error instanceof Error ? error.message : "unknown storage error") +
        (rollbackErrors.length ? " Rollback also needs attention for: " + rollbackErrors.join(", ") + ". Open World & Vault and verify those records." : " I rolled back any earlier writes; the canvas itself was not changed."));
    } finally {
      setSaving(false);
    }
  }

  return <section className="character-handoff" aria-label="Save character design to World and Vault">
    <div className="character-handoff-top">
      <span className="character-handoff-icon"><ShieldCheck size={18}/></span>
      <div className="character-handoff-copy">
        <b>{alreadyLinked ? "Design linked to World & Vault" : "Keep this character in your world"}</b>
        <p>{alreadyLinked ? alreadyLinked.title : "Turn this saved canvas into a reviewable character and visual timeline entry."}</p>
      </div>
      <button className="character-handoff-toggle" type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} disabled={loading}>
        {alreadyLinked ? "Review" : expanded ? "Close" : "Save design"} <ChevronDown size={15} className={expanded ? "is-open" : ""}/>
      </button>
    </div>
    {loading && <p className="character-handoff-status" role="status">Loading this project's World Bible and visual timeline…</p>}
    {feedback && <p className="character-handoff-status" role="status">{feedback}</p>}
    {alreadyLinked && <button className="character-handoff-open" type="button" onClick={onOpenVault}>Open World & Vault <ArrowRight size={14}/></button>}
    {expanded && !alreadyLinked && <form className="character-handoff-form" onSubmit={event => void saveDesign(event)}>
      <p className="character-handoff-note">The drawing stays editable and is linked as a visual reference. Kuro does not infer hidden pixels here: fill only details you confirm. All new records remain **proposed** until you approve them in the Vault.</p>
      <label>Character<select value={entityChoice} onChange={event => chooseCharacter(event.target.value)} disabled={saving || loading}>
        <option value="new">Create a new character proposal</option>
        {characters.map(entity => <option key={entity.id} value={entity.id}>{entity.name} · {entity.status}</option>)}
      </select></label>
      <label>Character name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required disabled={saving || Boolean(selectedCharacter)}/></label>
      {entityChoice === "new" && <label>Aliases (optional, comma separated)<input value={aliases} onChange={event => setAliases(event.target.value)} maxLength={500} disabled={saving}/></label>}
      <div className="character-handoff-traits">
        {visibleTraits.map(field => <label key={field.key}>{field.label}<input value={traits[field.key] ?? ""} onChange={event => changeTrait(field.key,event.target.value)} placeholder={field.placeholder} maxLength={500} disabled={saving}/></label>)}
      </div>
      <details className="character-handoff-more"><summary>More appearance & continuity details</summary>
        <div className="character-handoff-traits">
          {moreTraits.map(field => <label key={field.key}>{field.label}<input value={traits[field.key] ?? ""} onChange={event => changeTrait(field.key,event.target.value)} placeholder={field.placeholder} maxLength={500} disabled={saving}/></label>)}
        </div>
        <div className="character-handoff-traits">
          <label>Chapter number (optional)<input type="number" min="0" step="1" value={chapterNumber} onChange={event => setChapterNumber(event.target.value)} placeholder="Leave blank until placed in the story" disabled={saving}/></label>
          <label>Story order (optional)<input type="number" min="0" step="any" value={storyOrder} onChange={event => setStoryOrder(event.target.value)} placeholder="0 is a provisional starting position" disabled={saving}/></label>
        </div>
      </details>
      {originalPrompt.trim() && <details className="character-handoff-source"><summary>Original creation prompt</summary><p>{originalPrompt}</p></details>}
      <button className="character-handoff-save" type="submit" disabled={saving || loading || !name.trim() || !Object.values(traits).some(value => typeof value === "string" && value.trim())}>
        <Save size={15}/>{saving ? "Saving proposal…" : "Save character proposal"} <Sparkles size={14}/>
      </button>
    </form>}
    {alreadyLinked && <p className="character-handoff-status">This entry remains a proposal until its character and visual state are approved in the Vault.</p>}
  </section>;
}
