export interface ProjectOwnedRecord { id: string; projectId?: string }
export interface UniverseOwnedRecord { id: string; projectId: string }
export interface UniverseChildRecord { id: string; universeId: string }
export interface ConversationChildRecord extends UniverseChildRecord { conversationId?: string }
export interface DrawingRevisionRecord { id: string; drawingId: string }

export interface ProjectDeletionSnapshot {
  storyMemories: readonly ProjectOwnedRecord[];
  referenceSources: readonly ProjectOwnedRecord[];
  characterModels: readonly ProjectOwnedRecord[];
  drawings: readonly ProjectOwnedRecord[];
  drawingRevisions: readonly DrawingRevisionRecord[];
  universes: readonly UniverseOwnedRecord[];
  conversations: readonly UniverseChildRecord[];
  messages: readonly ConversationChildRecord[];
  relationships: readonly UniverseChildRecord[];
  characterStates: readonly UniverseChildRecord[];
}

export interface ProjectDeletionManifest {
  storyMemoryIds: string[];
  referenceSourceIds: string[];
  characterModelIds: string[];
  drawingIds: string[];
  drawingRevisionIds: string[];
  universeIds: string[];
  conversationIds: string[];
  messageIds: string[];
  relationshipIds: string[];
  characterStateIds: string[];
}

/** Resolve the exact owned records for a project without crossing universe boundaries. */
export function buildProjectDeletionManifest(
  projectId: string,
  snapshot: ProjectDeletionSnapshot,
): ProjectDeletionManifest {
  if (!projectId.trim()) throw new Error("Choose a project before removing it.");
  const belongsToProject = (record: ProjectOwnedRecord) => record.projectId === projectId;
  const universeIds = new Set(snapshot.universes.filter(record => record.projectId === projectId).map(record => record.id));
  const conversationIds = new Set(snapshot.conversations.filter(record => universeIds.has(record.universeId)).map(record => record.id));
  const drawingIds = new Set(snapshot.drawings.filter(belongsToProject).map(record => record.id));
  return {
    storyMemoryIds: snapshot.storyMemories.filter(belongsToProject).map(record => record.id),
    referenceSourceIds: snapshot.referenceSources.filter(belongsToProject).map(record => record.id),
    characterModelIds: snapshot.characterModels.filter(belongsToProject).map(record => record.id),
    drawingIds: [...drawingIds],
    drawingRevisionIds: snapshot.drawingRevisions.filter(record => drawingIds.has(record.drawingId)).map(record => record.id),
    universeIds: [...universeIds],
    conversationIds: [...conversationIds],
    messageIds: snapshot.messages.filter(record => universeIds.has(record.universeId)
      || (record.conversationId !== undefined && conversationIds.has(record.conversationId))).map(record => record.id),
    relationshipIds: snapshot.relationships.filter(record => universeIds.has(record.universeId)).map(record => record.id),
    characterStateIds: snapshot.characterStates.filter(record => universeIds.has(record.universeId)).map(record => record.id),
  };
}
