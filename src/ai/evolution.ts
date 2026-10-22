/** Memory and evolution primitives. Persistence, cross-user sharing, and model training are separate future integrations. */
export type MemoryScope = "project" | "personal" | "shared";
export type MemoryStatus = "proposed" | "approved" | "rejected" | "superseded";
export type MemoryKind = "preference" | "canon-fact" | "workflow" | "lesson" | "reference";

export interface KnowledgeProvenance {
  sourceType: "user-confirmation" | "project-file" | "tool-result" | "external-source" | "evaluation";
  sourceId?: string;
  citation?: string;
  observedAt: string;
}

export interface KuroMemory {
  id: string;
  scope: MemoryScope;
  /** Project memories must be isolated by project ID. */
  projectId?: string;
  kind: MemoryKind;
  title: string;
  content: string;
  status: MemoryStatus;
  confidence: number;
  provenance: KnowledgeProvenance[];
  createdAt: string;
  updatedAt: string;
  /** Shared memory must never contain private project content or raw conversation transcripts. */
  privacyReviewed: boolean;
}

export interface SkillEvaluation {
  id: string;
  skillId: string;
  datasetVersion: string;
  passed: boolean;
  score: number;
  checks: Array<{ name: string; passed: boolean; details?: string }>;
  evaluatedAt: string;
}

export interface SkillProposal {
  id: string;
  title: string;
  description: string;
  steps: Array<{ instruction: string; toolName?: string }>;
  evidence: KnowledgeProvenance[];
  status: "proposed" | "testing" | "approved" | "rejected" | "rolled-back";
  evaluations: SkillEvaluation[];
  createdAt: string;
  updatedAt: string;
  approvedByUser: boolean;
}

export interface EvolutionPolicy {
  personalLearningEnabled: boolean;
  sharedLearningEnabled: boolean;
  allowAutomaticSkillActivation: false;
  requirePrivacyReviewForShared: true;
  requireEvaluationBeforeActivation: true;
}

export const DEFAULT_EVOLUTION_POLICY: EvolutionPolicy = {
  personalLearningEnabled: true,
  sharedLearningEnabled: false,
  allowAutomaticSkillActivation: false,
  requirePrivacyReviewForShared: true,
  requireEvaluationBeforeActivation: true,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isValidProvenance(value: unknown): value is KnowledgeProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Partial<KnowledgeProvenance>;
  return ["user-confirmation", "project-file", "tool-result", "external-source", "evaluation"].includes(String(source.sourceType))
    && isValidTimestamp(source.observedAt)
    && (source.sourceId === undefined || typeof source.sourceId === "string")
    && (source.citation === undefined || typeof source.citation === "string");
}

/** Validate the full persisted record shape, not just fields most prompts happen to use. */
export function validateMemory(value: unknown): value is KuroMemory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<KuroMemory>;
  if (!isNonEmptyString(item.id)
    || !["project", "personal", "shared"].includes(String(item.scope))
    || !["preference", "canon-fact", "workflow", "lesson", "reference"].includes(String(item.kind))
    || !["proposed", "approved", "rejected", "superseded"].includes(String(item.status))
    || !isNonEmptyString(item.title)
    || !isNonEmptyString(item.content)
    || typeof item.confidence !== "number"
    || !Number.isFinite(item.confidence)
    || item.confidence < 0
    || item.confidence > 1
    || !Array.isArray(item.provenance)
    || !item.provenance.every(isValidProvenance)
    || !isValidTimestamp(item.createdAt)
    || !isValidTimestamp(item.updatedAt)
    || typeof item.privacyReviewed !== "boolean") return false;

  if (item.scope === "project" && !isNonEmptyString(item.projectId)) return false;
  // Globally shared records cannot be labelled as belonging to one private project.
  if (item.scope === "shared" && item.projectId !== undefined) return false;
  if (item.scope !== "project" && item.projectId !== undefined && !isNonEmptyString(item.projectId)) return false;
  return true;
}

export function canPromoteSkill(
  proposal: SkillProposal,
  policy: EvolutionPolicy = DEFAULT_EVOLUTION_POLICY,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!proposal.approvedByUser) reasons.push("User approval is required.");
  if (proposal.status !== "testing" && proposal.status !== "approved") reasons.push("The skill must be in testing before promotion.");
  if (proposal.evaluations.length === 0) reasons.push("At least one evaluation run is required.");
  if (policy.requireEvaluationBeforeActivation && !proposal.evaluations.some(result => result.passed)) {
    reasons.push("A passing evaluation is required before activation.");
  }
  return { allowed: reasons.length === 0, reasons };
}

/** Persistence is local storage; sharing is a separate, stricter eligibility decision. */
export function canPersistMemory(memory: KuroMemory, policy: EvolutionPolicy = DEFAULT_EVOLUTION_POLICY): boolean {
  return validateMemory(memory)
    && (memory.scope !== "shared"
      || (policy.sharedLearningEnabled
        && (!policy.requirePrivacyReviewForShared || memory.privacyReviewed)
        && memory.provenance.length > 0));
}

export function canShareMemory(memory: KuroMemory, policy: EvolutionPolicy = DEFAULT_EVOLUTION_POLICY): boolean {
  return validateMemory(memory)
    && policy.sharedLearningEnabled
    && memory.scope === "shared"
    && memory.projectId === undefined
    && memory.privacyReviewed
    && memory.status === "approved"
    && memory.provenance.length > 0;
}

export function createMemoryDraft(input: Omit<KuroMemory, "status" | "createdAt" | "updatedAt">): KuroMemory {
  const now = new Date().toISOString();
  return { ...input, status: "proposed", createdAt: now, updatedAt: now };
}
