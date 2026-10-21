export interface ScarOverlay {
  id: string;
  characterStateId: string;
  introducedAtOrder: number;
  removedAtOrder?: number;
  label: string;
  x: number;
  y: number;
  z: number;
  length: number;
  angle: number;
  color: string;
}
export interface CharacterModelRecord {
  id: string;
  projectId: string;
  characterName: string;
  sourceType: "procedural" | "uploaded-glb";
  fileName: string;
  modelBlob?: Blob;
  frontFace: "positive-z" | "negative-z";
  scarOverlays: ScarOverlay[];
  createdAt: string;
  updatedAt: string;
}
export function validateCharacterModel(value: unknown, projectId?: string): string[] {
  if (!value || typeof value !== "object") return ["Character model record must be an object."];
  const model = value as Partial<CharacterModelRecord>, errors: string[] = [];
  if (typeof model.id !== "string" || !model.id.trim()) errors.push("Character model needs an ID.");
  if (typeof model.projectId !== "string" || !model.projectId.trim()) errors.push("Character model needs a project ID.");
  if (projectId && model.projectId !== projectId) errors.push("Character model belongs to a different project.");
  if (typeof model.characterName !== "string" || !model.characterName.trim()) errors.push("Character model needs a character name.");
  if (model.sourceType !== "procedural" && model.sourceType !== "uploaded-glb") errors.push("Character model source type is invalid.");
  if (model.sourceType === "uploaded-glb" && (!(typeof Blob !== "undefined" && model.modelBlob instanceof Blob) || model.modelBlob.size < 4 || model.modelBlob.size > 15 * 1024 * 1024)) errors.push("Uploaded character models must be GLB blobs between 4 bytes and 15 MB.");
  if (model.sourceType === "procedural" && model.modelBlob) errors.push("Procedural models must not contain an uploaded blob.");
  if (model.frontFace !== "positive-z" && model.frontFace !== "negative-z") errors.push("Character model front-face orientation is invalid.");
  if (!Array.isArray(model.scarOverlays)) errors.push("Character model scar overlays must be a list.");
  else for (const scar of model.scarOverlays) {
    if (!scar || typeof scar.id !== "string" || typeof scar.characterStateId !== "string" || typeof scar.label !== "string" || !Number.isFinite(scar.introducedAtOrder)
      || ![scar.x, scar.y, scar.z, scar.length, scar.angle].every(Number.isFinite)
      || Math.abs(scar.x) > 0.5 || Math.abs(scar.y) > 0.5 || Math.abs(scar.z) > 0.5
      || (scar.removedAtOrder !== undefined && (!Number.isFinite(scar.removedAtOrder) || scar.removedAtOrder <= scar.introducedAtOrder))
      || scar.length <= 0 || scar.length > 0.5 || scar.angle < -180 || scar.angle > 180
      || !/^#[0-9a-f]{6}$/i.test(scar.color)) {
      errors.push("A scar overlay has invalid coordinates, size, angle, color, or state linkage.");
      break;
    }
  }
  if (typeof model.fileName !== "string" || typeof model.createdAt !== "string" || typeof model.updatedAt !== "string") errors.push("Character model metadata is incomplete.");
  return [...new Set(errors)];
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode the model file."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the model file."));
    reader.readAsDataURL(blob);
  });
}
export function dataUrlToBlob(value: string): Blob {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=]+)$/i.exec(value);
  if (!match) throw new Error("A bundled 3D model must be a base64 data URL.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}
