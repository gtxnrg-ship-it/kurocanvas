import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Activity, Check, Clock3, History, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import {
  characterStateAt,
  validateCharacterEvolutionState,
  type CharacterAppearanceField,
  type CharacterEvolutionState,
  type HairLength,
  type BodyIncarnationKind,
  type BodyIdentityContinuity,
  type MemoryContinuity,
  type PhysicalConditionKind,
  type PhysicalConditionStage,
  type PhysicalConditionState,
} from "./characterEvolution";
import { canonStorage, characterEvolutionStorage } from "../core/storage";
import "./characterTimelineStudio.css";

type CharacterEntity = { id: string; name: string; status: string; aliases: string[] };
type Props = { projectId: string; universeId: string };
const HAIR_LENGTHS: HairLength[] = ["shaved", "very-short", "short", "chin", "shoulder", "mid-back", "waist", "floor", "variable", "unknown"];
const INCARNATIONS: BodyIncarnationKind[] = ["original", "reincarnation", "resurrection", "possession", "transformation", "clone", "other"];
const IDENTITY_CONTINUITIES: BodyIdentityContinuity[] = ["same-person", "different-person", "shared-body", "uncertain"];
const MEMORY_CONTINUITIES: MemoryContinuity[] = ["full", "partial", "none", "uncertain"];
const CONDITION_KINDS: PhysicalConditionKind[] = ["bruise", "cut", "open-wound", "fracture", "sprain", "burn", "swelling", "dental-injury", "illness", "scar", "other"];
const CONDITION_STAGES: PhysicalConditionStage[] = ["fresh", "active", "healing", "healed", "permanent", "unknown"];
const blank = (value?: string) => value ?? "";
const listText = (value?: string[]) => value?.join("\n") ?? "";
const parseList = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const entityLabel = (entity: CharacterEntity) => entity.name + (entity.status === "approved" ? "" : " · " + entity.status);

export default function CharacterTimelineStudio({ projectId, universeId }: Props) {
  const [characters, setCharacters] = useState<CharacterEntity[]>([]);
  const [records, setRecords] = useState<CharacterEvolutionState[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [timelineId, setTimelineId] = useState("main");
  const [storyOrder, setStoryOrder] = useState("10");
  const [chapterNumber, setChapterNumber] = useState("1");
  const [sceneNumber, setSceneNumber] = useState("");
  const [revealAtStoryOrder, setRevealAtStoryOrder] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [height, setHeight] = useState("");
  const [build, setBuild] = useState("");
  const [faceAndFeatures, setFaceAndFeatures] = useState("");
  const [hairLength, setHairLength] = useState<HairLength>("unknown");
  const [hairStyle, setHairStyle] = useState("");
  const [hairColor, setHairColor] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [skinTone, setSkinTone] = useState("");
  const [outfitId, setOutfitId] = useState("");
  const [outfitDescription, setOutfitDescription] = useState("");
  const [scarsAndMarks, setScarsAndMarks] = useState("");
  const [voiceAndMannerisms, setVoiceAndMannerisms] = useState("");
  const [abilitiesAndSkills, setAbilitiesAndSkills] = useState("");
  const [personalityChanges, setPersonalityChanges] = useState("");
  const [visualNotes, setVisualNotes] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [emotionalState, setEmotionalState] = useState("");
  const [bodyInstanceId, setBodyInstanceId] = useState("");
  const [incarnationKind, setIncarnationKind] = useState<BodyIncarnationKind>("original");
  const [identityContinuity, setIdentityContinuity] = useState<BodyIdentityContinuity>("same-person");
  const [memoryContinuity, setMemoryContinuity] = useState<MemoryContinuity>("uncertain");
  const [previousBodyInstanceId, setPreviousBodyInstanceId] = useState("");
  const [ageAtIncarnation, setAgeAtIncarnation] = useState("");
  const [unknownFields, setUnknownFields] = useState<CharacterAppearanceField[]>([]);
  const [conditions, setConditions] = useState<PhysicalConditionState[]>([]);
  const [conditionsTouched, setConditionsTouched] = useState(false);
  const [clearConditions, setClearConditions] = useState(false);
  const [newConditionKind, setNewConditionKind] = useState<PhysicalConditionKind>("bruise");
  const [newConditionLabel, setNewConditionLabel] = useState("");
  const [newConditionRegion, setNewConditionRegion] = useState("");
  const [newConditionSeverity, setNewConditionSeverity] = useState("2");
  const [newConditionStage, setNewConditionStage] = useState<PhysicalConditionStage>("fresh");
  const [newConditionProgress, setNewConditionProgress] = useState("0");
  const [newConditionVisible, setNewConditionVisible] = useState("");
  const [newConditionImpact, setNewConditionImpact] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Character state, body identity, and injury history are saved per universe. New snapshots begin as proposals.");
  const refreshGeneration = useRef(0);

  async function refresh() {
    const requestId = ++refreshGeneration.current;
    if (!projectId || !universeId) {
      setCharacters([]); setRecords([]); setCharacterId("");
      setMessage("Open a universe before editing its character timeline.");
      return;
    }
    setBusy(true);
    try {
      const [bundle, states] = await Promise.all([
        canonStorage.load(projectId),
        characterEvolutionStorage.list(universeId),
      ]);
      if (requestId !== refreshGeneration.current) return;
      const nextCharacters = (bundle?.entities ?? [])
        .filter(entity => entity.kind.toLocaleLowerCase() === "character" && entity.status !== "superseded" && entity.status !== "contradicted")
        .map(entity => ({ id: entity.id, name: entity.name, status: entity.status, aliases: entity.aliases }));
      setCharacters(nextCharacters);
      setRecords(states);
      setCharacterId(current => nextCharacters.some(item => item.id === current) ? current : nextCharacters[0]?.id ?? "");
      setMessage("Loaded " + states.length + " saved character-state snapshots from this universe.");
    } catch (error) {
      if (requestId === refreshGeneration.current) setMessage(error instanceof Error ? error.message : "Could not load character continuity.");
    } finally { if (requestId === refreshGeneration.current) setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [projectId, universeId]);

  const selectedCharacter = useMemo(() => characters.find(item => item.id === characterId), [characters, characterId]);
  const order = Number(storyOrder);
  const previousApproved = useMemo(() => records
    .filter(item => item.characterId === characterId && item.timelineId === timelineId && item.status === "approved"
      && Number.isFinite(order) && item.storyOrder < order)
    .sort((a, b) => b.storyOrder - a.storyOrder), [records, characterId, timelineId, order]);
  const baseState = useMemo(() => {
    if (!universeId || !characterId || !timelineId || !previousApproved.length) return undefined;
    try {
      return characterStateAt(records, universeId, characterId, timelineId, previousApproved[0].storyOrder);
    } catch {
      return undefined; // Conflicts are surfaced below; never guess between approved snapshots.
    }
  }, [records, universeId, characterId, timelineId, previousApproved]);
  const approvedConflict = records.some(item => item.characterId === characterId && item.timelineId === timelineId
    && item.status === "approved" && Number.isFinite(order) && item.storyOrder === order);
  const conflictingApproved = previousApproved.length > 1 && previousApproved[0].storyOrder === previousApproved[1].storyOrder;

  useEffect(() => {
    const a = baseState?.appearance;
    setAgeYears(a?.ageYears === undefined ? "" : String(a.ageYears));
    setHeight(blank(a?.height)); setBuild(blank(a?.build)); setFaceAndFeatures(blank(a?.faceAndFeatures));
    setHairLength(a?.hairLength ?? "unknown"); setHairStyle(blank(a?.hairStyle)); setHairColor(blank(a?.hairColor));
    setEyeColor(blank(a?.eyeColor)); setSkinTone(blank(a?.skinTone)); setOutfitId(blank(a?.outfitId)); setOutfitDescription(blank(a?.outfitDescription));
    setScarsAndMarks(listText(a?.scarsAndMarks)); setVoiceAndMannerisms(listText(a?.voiceAndMannerisms));
    setAbilitiesAndSkills(listText(a?.abilitiesAndSkills)); setPersonalityChanges(listText(a?.personalityChanges)); setVisualNotes(listText(a?.visualNotes));
    setEmotionalState(blank(baseState?.emotionalAndBehavioralState));
    setBodyInstanceId(blank(a?.bodyIdentity?.bodyInstanceId)); setIncarnationKind(a?.bodyIdentity?.incarnationKind ?? "original");
    setIdentityContinuity(a?.bodyIdentity?.identityContinuity ?? "same-person"); setMemoryContinuity(a?.bodyIdentity?.memoryContinuity ?? "uncertain");
    setPreviousBodyInstanceId(blank(a?.bodyIdentity?.previousBodyInstanceId)); setAgeAtIncarnation(a?.bodyIdentity?.ageAtIncarnation === undefined ? "" : String(a.bodyIdentity.ageAtIncarnation));
    setRevealAtStoryOrder(baseState?.revealAtStoryOrder === undefined ? "" : String(baseState.revealAtStoryOrder));
    setUnknownFields(a?.unknownFields ?? []); setConditions(a?.physicalConditions ?? []); setChangeSummary("");
    setConditionsTouched(false); setClearConditions(false);
  }, [baseState?.id, characterId, timelineId]);

  function toggleUnknown(field: CharacterAppearanceField, enabled: boolean) {
    setUnknownFields(current => enabled ? [...new Set([...current, field])] : current.filter(item => item !== field));
    if (field === "physicalConditions") {
      setConditionsTouched(false);
      setClearConditions(false);
      if (!enabled) setConditions(baseState?.appearance.physicalConditions ?? []);
    }
  }
  function updateCondition(id: string, patch: Partial<PhysicalConditionState>) {
    setConditionsTouched(true); setClearConditions(false);
    setConditions(current => current.map(condition => {
      if (condition.id !== id) return condition;
      const next = { ...condition, ...patch };
      if (next.stage === "healed") { next.healingProgressPercent = 100; next.painLevel = 0; }
      if (patch.stage && patch.stage !== "healed" && next.healingProgressPercent === 100) next.healingProgressPercent = 75;
      return next;
    }));
  }
  function addCondition() {
    if (!newConditionLabel.trim() || !newConditionRegion.trim() || !newConditionVisible.trim()) {
      setMessage("A condition needs a name, body location, and a description of what is visibly true at this story point.");
      return;
    }
    if (!Number.isInteger(Number(newConditionSeverity)) || Number(newConditionSeverity) < 1 || Number(newConditionSeverity) > 5
      || !Number.isFinite(Number(newConditionProgress)) || Number(newConditionProgress) < 0 || Number(newConditionProgress) > 100) {
      setMessage("Severity must be 1–5 and healing progress must be 0–100.");
      return;
    }
    const target = Number(storyOrder);
    if (!Number.isFinite(target) || target < 0) { setMessage("Set a valid story order before adding a condition."); return; }
    const healed = newConditionStage === "healed";
    const condition: PhysicalConditionState = {
      id: crypto.randomUUID(), kind: newConditionKind, label: newConditionLabel.trim(), bodyRegion: newConditionRegion.trim(),
      stage: newConditionStage, severity: Number(newConditionSeverity), firstSeenStoryOrder: target,
      healingProgressPercent: healed ? 100 : Number(newConditionProgress), painLevel: healed ? 0 : undefined,
      visibleDescription: newConditionVisible.trim(), functionalImpact: newConditionImpact.trim() || undefined, permanentMark: newConditionStage === "permanent",
    };
    setConditions(current => [...current, condition]); setConditionsTouched(true); setClearConditions(false); setUnknownFields(current => current.filter(field => field !== "physicalConditions"));
    setNewConditionLabel(""); setNewConditionRegion(""); setNewConditionVisible(""); setNewConditionImpact(""); setNewConditionProgress("0");
    setMessage("Condition added to the draft state. It becomes canon only after the snapshot is approved.");
  }
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void saveSnapshot();
  }
  async function saveSnapshot() {
    if (!universeId || !projectId) { setMessage("Choose a valid universe before saving character states."); return; }
    if (!selectedCharacter || !selectedCharacter.id) { setMessage("Add a character entity in the World Bible first."); return; }
    if (!timelineId.trim()) { setMessage("Every state must belong to an explicit timeline ID."); return; }
    if (!Number.isFinite(order) || !Number.isInteger(order) || order < 0) { setMessage("Story order must be a non-negative whole number."); return; }
    if (chapterNumber.trim() && (!Number.isInteger(Number(chapterNumber)) || Number(chapterNumber) < 0)) { setMessage("Chapter number must be a non-negative whole number."); return; }
    if (sceneNumber.trim() && (!Number.isInteger(Number(sceneNumber)) || Number(sceneNumber) < 0)) { setMessage("Scene number must be a non-negative whole number."); return; }
    if (revealAtStoryOrder.trim() && (!Number.isFinite(Number(revealAtStoryOrder)) || Number(revealAtStoryOrder) < 0)) { setMessage("Reveal gate must be a non-negative story order."); return; }
    if (ageAtIncarnation.trim() && (!Number.isFinite(Number(ageAtIncarnation)) || Number(ageAtIncarnation) < 0 || Number(ageAtIncarnation) > 10000)) { setMessage("Age of the new body must be between 0 and 10000."); return; }
    if (approvedConflict) { setMessage("An approved snapshot already exists at this exact story order. Use the existing snapshot or choose a new order; ambiguous canon is never overwritten silently."); return; }
    if (conflictingApproved) { setMessage("More than one approved prior snapshot exists at the same story order. Resolve that conflict before creating later states."); return; }
    const oldRevealGates = [...new Set(records.filter(item => item.characterId === characterId && item.timelineId === timelineId && item.status === "approved")
      .flatMap(item => item.revealAtStoryOrder === undefined ? [] : [item.revealAtStoryOrder]))];
    const requestedGate = revealAtStoryOrder.trim() ? Number(revealAtStoryOrder) : baseState?.revealAtStoryOrder;
    if (oldRevealGates.some(gate => requestedGate !== undefined && gate !== requestedGate)) {
      setMessage("This character already has an approved reveal gate. Changing it is a canon retcon; create a dedicated retcon rather than silently changing old chapters.");
      return;
    }
    const previousBody = baseState?.appearance.bodyIdentity;
    const newBodyId = bodyInstanceId.trim() || previousBody?.bodyInstanceId;
    const bodyIdentity = newBodyId ? {
      bodyInstanceId: newBodyId,
      incarnationKind,
      identityContinuity,
      memoryContinuity,
      ...(previousBodyInstanceId.trim() || (previousBody?.bodyInstanceId && previousBody.bodyInstanceId !== newBodyId) ? {
        previousBodyInstanceId: previousBodyInstanceId.trim() || previousBody!.bodyInstanceId,
      } : previousBody?.previousBodyInstanceId ? { previousBodyInstanceId: previousBody.previousBodyInstanceId } : {}),
      ...(selectedAgeAtIncarnation() === undefined ? {} : { ageAtIncarnation: selectedAgeAtIncarnation() }),
      ...(previousBody?.notes ? { notes: previousBody.notes } : {}),
    } : undefined;
    const appearance = { ...(baseState?.appearance ?? {}) } as CharacterEvolutionState["appearance"];
    const setValue = <K extends keyof typeof appearance>(field: K, value: (typeof appearance)[K]) => { (appearance as Record<string, unknown>)[field as string] = value; };
    const scalarUpdates: Array<[CharacterAppearanceField, string, (value: string) => unknown]> = [
      ["height", height, value => value.trim() || undefined],
      ["build", build, value => value.trim() || undefined],
      ["faceAndFeatures", faceAndFeatures, value => value.trim() || undefined],
      ["hairStyle", hairStyle, value => value.trim() || undefined],
      ["hairColor", hairColor, value => value.trim() || undefined],
      ["eyeColor", eyeColor, value => value.trim() || undefined],
      ["skinTone", skinTone, value => value.trim() || undefined],
      ["outfitId", outfitId, value => value.trim() || undefined],
      ["outfitDescription", outfitDescription, value => value.trim() || undefined],
    ];
    for (const [field, fieldValue, parse] of scalarUpdates) {
      if (unknownFields.includes(field)) { delete appearance[field as keyof typeof appearance]; continue; }
      if (fieldValue.trim()) setValue(field as keyof typeof appearance, parse(fieldValue) as never);
    }
    if (unknownFields.includes("ageYears")) delete appearance.ageYears;
    else if (ageYears.trim()) appearance.ageYears = Number(ageYears);
    if (hairLength !== "unknown" || !appearance.hairLength) appearance.hairLength = hairLength;
    if (unknownFields.includes("scarsAndMarks")) delete appearance.scarsAndMarks;
    else if (scarsAndMarks.trim()) appearance.scarsAndMarks = parseList(scarsAndMarks);
    if (unknownFields.includes("voiceAndMannerisms")) delete appearance.voiceAndMannerisms;
    else if (voiceAndMannerisms.trim()) appearance.voiceAndMannerisms = parseList(voiceAndMannerisms);
    if (unknownFields.includes("abilitiesAndSkills")) delete appearance.abilitiesAndSkills;
    else if (abilitiesAndSkills.trim()) appearance.abilitiesAndSkills = parseList(abilitiesAndSkills);
    if (unknownFields.includes("personalityChanges")) delete appearance.personalityChanges;
    else if (personalityChanges.trim()) appearance.personalityChanges = parseList(personalityChanges);
    if (unknownFields.includes("visualNotes")) delete appearance.visualNotes;
    else if (visualNotes.trim()) appearance.visualNotes = parseList(visualNotes);
    if (unknownFields.includes("bodyIdentity")) delete appearance.bodyIdentity;
    else if (bodyIdentity) appearance.bodyIdentity = bodyIdentity;
    if (unknownFields.includes("physicalConditions")) delete appearance.physicalConditions;
    else if (conditionsTouched) appearance.physicalConditions = clearConditions ? [] : conditions.map(item => ({ ...item }));
    appearance.unknownFields = unknownFields.filter(field => appearance[field] === undefined);
    if (!appearance.unknownFields.length) delete appearance.unknownFields;
    const previousState = baseState;
    const record: CharacterEvolutionState = {
      id: crypto.randomUUID(), universeId, characterId, timelineId: timelineId.trim(), storyOrder: order,
      ...(chapterNumber.trim() ? { chapterNumber: Number(chapterNumber) } : {}),
      ...(sceneNumber.trim() ? { sceneNumber: Number(sceneNumber) } : {}),
      ...(requestedGate === undefined ? {} : { revealAtStoryOrder: requestedGate }),
      ...(previousState ? { previousStateId: previousState.id } : {}),
      status: "proposed", appearance,
      ...(emotionalState.trim() ? { emotionalAndBehavioralState: emotionalState.trim() } : {}),
      relationshipStateRefs: previousState?.relationshipStateRefs ?? [],
      assetRefs: previousState?.assetRefs ?? [],
      sourceMessageIds: previousState?.sourceMessageIds ?? [],
      changeSummary: changeSummary.trim() || "Character state at story order " + order + (chapterNumber.trim() ? " (chapter " + chapterNumber + ")" : ""),
      createdAt: new Date().toISOString(),
    };
    const errors = validateCharacterEvolutionState(record, universeId);
    if (errors.length) { setMessage("Snapshot was not saved: " + errors.join(" ")); return; }
    setBusy(true);
    try {
      await characterEvolutionStorage.save(record);
      setRecords(current => [...current, record]);
      setMessage("Saved this temporal state as a proposal. Review it in the timeline below and approve it before Kuro treats it as canon.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the character state.");
    } finally { setBusy(false); }
  }
  function selectedAgeAtIncarnation(): number | undefined {
    if (!ageAtIncarnation.trim()) return undefined;
    const n = Number(ageAtIncarnation);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  async function approve(record: CharacterEvolutionState) {
    setBusy(true);
    try {
      const duplicates = records.filter(item => item.id !== record.id && item.characterId === record.characterId
        && item.timelineId === record.timelineId && item.storyOrder === record.storyOrder && item.status === "approved");
      if (duplicates.length) throw new Error("Another approved state already exists at that character/timeline/story order.");
      const proposed: CharacterEvolutionState = { ...record, status: "approved" };
      const errors = validateCharacterEvolutionState(proposed, universeId);
      if (errors.length) throw new Error(errors.join(" "));
      await characterEvolutionStorage.save(proposed);
      setRecords(current => current.map(item => item.id === record.id ? proposed : item));
      setMessage("Approved character snapshot. Kuro can use it only after its reveal gate and only at or after this story point.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not approve snapshot."); }
    finally { setBusy(false); }
  }
  async function remove(record: CharacterEvolutionState) {
    if (record.status !== "proposed") { setMessage("Approved history is preserved. Create a later correcting snapshot or handle changes through a retcon workflow."); return; }
    if (!globalThis.confirm("Delete this unapproved proposal?")) return;
    setBusy(true);
    try {
      await characterEvolutionStorage.removeProposal(record.id, universeId);
      setRecords(current => current.filter(item => item.id !== record.id));
      setMessage("Deleted the unapproved proposal.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete proposal."); }
    finally { setBusy(false); }
  }

  return <section className="character-timeline-studio">
    <div className="timeline-head">
      <div><small>VAULT · TEMPORAL CHARACTER CANON</small><h2><Activity size={20}/> Character body & injury timeline</h2>
        <p>Track age, incarnation/body identity, reveal timing, visual changes and injuries across chapters. Historical snapshots stay intact; missing fields inherit, and explicitly unknown fields do not.</p>
      </div>
      <button type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button>
    </div>
    {!universeId || !projectId ? <div className="timeline-empty"><ShieldAlert size={20}/><b>No active universe</b><span>Open a universe first. Each universe owns its own character timeline.</span></div> : characters.length === 0 ? (
      <div className="timeline-empty"><ShieldAlert size={20}/><b>No character entities found</b><span>Create a character in the World Bible first. Preload future cast there, then set a reveal order below.</span></div>
    ) : <>
      <form className="timeline-editor" onSubmit={handleSubmit}>
        <div className="timeline-form-grid">
          <label>Character <select value={characterId} onChange={event => {
            const nextId = event.target.value; setCharacterId(nextId);
            const maximum = records.filter(item => item.characterId === nextId && item.timelineId === timelineId)
              .reduce((max,item) => Math.max(max,item.storyOrder), -1);
            setStoryOrder(String(Math.max(10, maximum + 10)));
          }}>{characters.map(character => <option key={character.id} value={character.id}>{entityLabel(character)}</option>)}</select></label>
          <label>Timeline ID <input value={timelineId} onChange={event => setTimelineId(event.target.value)} maxLength={100} required placeholder="main"/></label>
          <label>Story order <input type="number" min="0" step="1" value={storyOrder} onChange={event => setStoryOrder(event.target.value)} required/></label>
          <label>Chapter <input type="number" min="0" step="1" value={chapterNumber} onChange={event => setChapterNumber(event.target.value)} placeholder="Optional"/></label>
          <label>Scene <input type="number" min="0" step="1" value={sceneNumber} onChange={event => setSceneNumber(event.target.value)} placeholder="Optional"/></label>
          <label>Reveal at story order <input type="number" min="0" step="1" value={revealAtStoryOrder} onChange={event => setRevealAtStoryOrder(event.target.value)} placeholder="Blank = first approved state"/></label>
        </div>
        <div className="timeline-fieldset"><h3>Appearance at this point in the story</h3><p>Leave a field unchanged to carry the last approved value forward. Use “Explicitly unknown” when you need to erase earlier knowledge.</p>
          <div className="timeline-form-grid">
            <label>Age in years <input type="number" min="0" max="10000" step="1" value={ageYears} onChange={event => {setAgeYears(event.target.value);toggleUnknown("ageYears",false);}}/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("ageYears")} onChange={event=>toggleUnknown("ageYears",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Height <input value={height} onChange={event=>{setHeight(event.target.value);toggleUnknown("height",false);}} placeholder="e.g. 175 cm"/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("height")} onChange={event=>toggleUnknown("height",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Build <input value={build} onChange={event=>{setBuild(event.target.value);toggleUnknown("build",false);}} placeholder="lean, broad-shouldered…"/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("build")} onChange={event=>toggleUnknown("build",false)}/> Explicitly unknown</span></label>
            <label>Face/features <input value={faceAndFeatures} onChange={event=>{setFaceAndFeatures(event.target.value);toggleUnknown("faceAndFeatures",false);}} placeholder="jaw, freckles, expression…"/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("faceAndFeatures")} onChange={event=>toggleUnknown("faceAndFeatures",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Hair length <select value={hairLength} onChange={event=>setHairLength(event.target.value as HairLength)}>{HAIR_LENGTHS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
            <label>Hair color <input value={hairColor} onChange={event=>{setHairColor(event.target.value);toggleUnknown("hairColor",false);}}/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("hairColor")} onChange={event=>toggleUnknown("hairColor",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Hair style <input value={hairStyle} onChange={event=>{setHairStyle(event.target.value);toggleUnknown("hairStyle",false);}} placeholder="fringe, tied back…"/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("hairStyle")} onChange={event=>toggleUnknown("hairStyle",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Eye color <input value={eyeColor} onChange={event=>{setEyeColor(event.target.value);toggleUnknown("eyeColor",false);}}/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("eyeColor")} onChange={event=>toggleUnknown("eyeColor",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Skin tone <input value={skinTone} onChange={event=>{setSkinTone(event.target.value);toggleUnknown("skinTone",false);}}/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("skinTone")} onChange={event=>toggleUnknown("skinTone",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Outfit asset ID <input value={outfitId} onChange={event=>{setOutfitId(event.target.value);toggleUnknown("outfitId",false);}} placeholder="stable outfit ID"/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("outfitId")} onChange={event=>toggleUnknown("outfitId",event.target.checked)}/> Explicitly unknown</span></label>
            <label>Outfit description <input value={outfitDescription} onChange={event=>{setOutfitDescription(event.target.value);toggleUnknown("outfitDescription",false);}} placeholder="same torn jacket, missing sleeve…"/><span className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("outfitDescription")} onChange={event=>toggleUnknown("outfitDescription",event.target.checked)}/> Explicitly unknown</span></label>
          </div>
          <label>Scars / marks (one per line)<textarea rows={2} value={scarsAndMarks} onChange={event=>{setScarsAndMarks(event.target.value);toggleUnknown("scarsAndMarks",false);}} placeholder="Do not remove old scars unless canon changes."/></label>
          <label>Voice and mannerisms (one per line)<textarea rows={2} value={voiceAndMannerisms} onChange={event=>{setVoiceAndMannerisms(event.target.value);toggleUnknown("voiceAndMannerisms",false);}} placeholder="speaks softly; favors left leg; breath catches under stress…"/></label>
          <label>Abilities and skills (one per line)<textarea rows={2} value={abilitiesAndSkills} onChange={event=>{setAbilitiesAndSkills(event.target.value);toggleUnknown("abilitiesAndSkills",false);}}/></label>
          <label>Personality changes (one per line)<textarea rows={2} value={personalityChanges} onChange={event=>{setPersonalityChanges(event.target.value);toggleUnknown("personalityChanges",false);}}/></label>
          <label>Visual notes (one per line)<textarea rows={2} value={visualNotes} onChange={event=>{setVisualNotes(event.target.value);toggleUnknown("visualNotes",false);}} placeholder="posture, how they move, art/style notes…"/></label>
          <label>Emotional / behavioral state<textarea rows={2} value={emotionalState} onChange={event=>setEmotionalState(event.target.value)} placeholder="What is different emotionally at this point?"/></label>
        </div>
        <div className="timeline-fieldset"><h3>Person versus body</h3><p>Keep identity and physical body separate, so reincarnation can change the character’s appearance without erasing the person’s history.</p>
          <div className="timeline-form-grid">
            <label>Body instance ID <input value={bodyInstanceId} onChange={event=>{setBodyInstanceId(event.target.value);toggleUnknown("bodyIdentity",false);}} placeholder="body-001"/></label>
            <label>Incarnation / body event <select value={incarnationKind} onChange={event=>setIncarnationKind(event.target.value as BodyIncarnationKind)}>{INCARNATIONS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
            <label>Person identity continuity <select value={identityContinuity} onChange={event=>setIdentityContinuity(event.target.value as BodyIdentityContinuity)}>{IDENTITY_CONTINUITIES.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
            <label>Memory after transition <select value={memoryContinuity} onChange={event=>setMemoryContinuity(event.target.value as MemoryContinuity)}>{MEMORY_CONTINUITIES.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
            <label>Previous body ID <input value={previousBodyInstanceId} onChange={event=>setPreviousBodyInstanceId(event.target.value)} placeholder="Auto-links when body changes"/></label>
            <label>Age of new body <input type="number" min="0" max="10000" value={ageAtIncarnation} onChange={event=>setAgeAtIncarnation(event.target.value)} placeholder="At reincarnation"/></label>
          </div>
          <label className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("bodyIdentity")} onChange={event=>toggleUnknown("bodyIdentity",event.target.checked)}/> Body identity is explicitly unknown; do not assume this is the same body.</label>
        </div>
        <div className="timeline-fieldset"><h3><Activity size={16}/> Physical condition lifecycle</h3><p>Each condition keeps a stable ID across snapshots. Mark it healing or healed deliberately; omission does not mean the injury disappeared.</p>
          {conditions.length === 0 ? <p className="timeline-muted">No structured conditions in this draft. If there are no active injuries, use “Explicitly none”; otherwise leave unchanged to inherit the previous roster.</p> :
            <div className="timeline-condition-list">{conditions.map(condition=><article key={condition.id} className="timeline-condition">
              <div><b>{condition.label}</b><span>{condition.kind} · {condition.bodyRegion} · severity {condition.severity}/5</span></div>
              <label>Stage <select value={condition.stage} onChange={event=>updateCondition(condition.id,{stage:event.target.value as PhysicalConditionStage})}>{CONDITION_STAGES.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
              <label>Healing % <input type="number" min="0" max="100" value={condition.healingProgressPercent ?? ""} onChange={event=>updateCondition(condition.id,{healingProgressPercent:Number(event.target.value)})}/></label>
              <label>Pain / 10 <input type="number" min="0" max="10" value={condition.painLevel ?? ""} onChange={event=>updateCondition(condition.id,{painLevel:Number(event.target.value)})}/></label>
              <label className="condition-description">Visible now <textarea rows={2} value={condition.visibleDescription} onChange={event=>updateCondition(condition.id,{visibleDescription:event.target.value})}/></label>
              <label className="condition-description">Functional impact <input value={condition.functionalImpact ?? ""} onChange={event=>updateCondition(condition.id,{functionalImpact:event.target.value})}/></label>
              <button type="button" disabled={busy} onClick={()=>{setConditions(current=>current.filter(item=>item.id!==condition.id));setConditionsTouched(true);setClearConditions(false);}}>Remove from current roster</button>
            </article>)}</div>}
          <div className="timeline-condition-add">
            <label>Condition <select value={newConditionKind} onChange={event=>setNewConditionKind(event.target.value as PhysicalConditionKind)}>{CONDITION_KINDS.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
            <label>Name <input value={newConditionLabel} onChange={event=>setNewConditionLabel(event.target.value)} placeholder="Broken left arm"/></label>
            <label>Body region <input value={newConditionRegion} onChange={event=>setNewConditionRegion(event.target.value)} placeholder="left forearm"/></label>
            <label>Severity <select value={newConditionSeverity} onChange={event=>setNewConditionSeverity(event.target.value)}>{[1,2,3,4,5].map(item=><option key={item} value={item}>{item}/5</option>)}</select></label>
            <label>Stage <select value={newConditionStage} onChange={event=>setNewConditionStage(event.target.value as PhysicalConditionStage)}>{CONDITION_STAGES.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
            <label>Healing % <input type="number" min="0" max="100" value={newConditionProgress} onChange={event=>setNewConditionProgress(event.target.value)} disabled={newConditionStage==="healed"}/></label>
            <label className="condition-description">Visible description <textarea rows={2} value={newConditionVisible} onChange={event=>setNewConditionVisible(event.target.value)} placeholder="bruise is purple, swelling remains…"/></label>
            <label className="condition-description">Functional impact <input value={newConditionImpact} onChange={event=>setNewConditionImpact(event.target.value)} placeholder="limited grip, painful chewing…"/></label>
            <button type="button" onClick={addCondition}><Plus size={13}/> Add condition</button>
          </div>
          <div className="timeline-condition-options">
            <label className="timeline-unknown"><input type="checkbox" checked={clearConditions} onChange={event=>{setClearConditions(event.target.checked);setConditionsTouched(true);setConditions(event.target.checked?[]:(baseState?.appearance.physicalConditions??[]));setUnknownFields(current=>current.filter(field=>field!=="physicalConditions"));}}/> Explicitly none at this story point</label>
            <label className="timeline-unknown"><input type="checkbox" checked={unknownFields.includes("physicalConditions")} onChange={event=>{toggleUnknown("physicalConditions",event.target.checked);if(event.target.checked)setConditions([]);}}/> Injury state explicitly unknown</label>
          </div>
        </div>
        <div className="timeline-fieldset"><h3>Canon review</h3><p>New snapshots begin as proposals. Approving one makes it eligible for continuity retrieval, but the reveal gate and story order still apply.</p>
          <label>What changed in this snapshot?<textarea rows={2} value={changeSummary} onChange={event=>setChangeSummary(event.target.value)} placeholder="e.g. Reincarnated into a 15-year-old body; nose bruise is fading; left arm remains splinted."/></label>
          <button type="submit" className="timeline-primary" disabled={busy || !characterId}><Plus size={14}/> Save temporal snapshot as proposal</button>
        </div>
      </form>
      <div className="timeline-history-head"><h3>Saved states</h3><span>{records.filter(item=>item.characterId===characterId).length} snapshots · {selectedCharacter?.name ?? "No character"}</span></div>
      <div className="timeline-history">{records.filter(item=>item.characterId===characterId).sort((a,b)=>a.storyOrder-b.storyOrder || a.createdAt.localeCompare(b.createdAt)).map(record=><article key={record.id} className={"timeline-record "+record.status}>
        <div className="timeline-record-top"><div><small>{record.timelineId} · order {record.storyOrder}{record.chapterNumber===undefined?"":" · Chapter "+record.chapterNumber}{record.sceneNumber===undefined?"":" · Scene "+record.sceneNumber}</small><b>{record.changeSummary}</b></div>
          <span className={"timeline-status "+record.status}>{record.status==="approved"?<><Check size={12}/> Approved</>:record.status==="proposed"?<><Clock3 size={12}/> Needs review</>:<><History size={12}/> Older version</>}</span>
        </div>
        <p>Age: {record.appearance.ageYears ?? "unknown"} · Body: {record.appearance.bodyIdentity?.bodyInstanceId ?? "unknown"} · {record.appearance.bodyIdentity?.incarnationKind ?? "body not recorded"} · Reveal: {record.revealAtStoryOrder ?? "first appearance"}</p>
        <p>Conditions: {record.appearance.physicalConditions===undefined?"inherited/not separately recorded":record.appearance.physicalConditions.length?record.appearance.physicalConditions.map(item=>item.label+" ("+item.stage+", "+(item.healingProgressPercent===undefined?"?":item.healingProgressPercent+"%")+")").join("; "):"explicitly none"}</p>
        <div className="timeline-record-actions">
          {record.status==="proposed"&&<button type="button" disabled={busy} onClick={()=>void approve(record)}><Check size={13}/> Approve snapshot</button>}
          {record.status==="proposed"&&<button type="button" className="timeline-danger" disabled={busy} onClick={()=>void remove(record)}><Trash2 size={13}/> Delete proposal</button>}
          {record.status==="approved"&&<span className="timeline-preserved"><History size={12}/> Preserved history</span>}
        </div>
      </article>)}</div>
    </>}
    <p className="timeline-message" role="status" aria-live="polite">{message}</p>
  </section>;
}
