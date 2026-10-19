export type CanonStatus = "approved" | "proposed" | "inferred" | "contradicted" | "superseded";
export interface CanonEntity { id: string; projectId: string; kind: string; name: string; aliases: string[]; status: CanonStatus }
export interface CanonFact { id: string; projectId: string; subjectId: string; predicate: string; value: unknown; status: CanonStatus; storyOrder?: number; dependsOn?: string[] }
export interface CanonBundle { schemaVersion: 1; projectId: string; entities: CanonEntity[]; facts: CanonFact[] }
