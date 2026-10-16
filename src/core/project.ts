export type ApprovalState = "draft" | "proposed" | "approved" | "superseded";
export type AssetKind = "character-sheet" | "environment" | "panel-layout" | "3d-scene" | "reference" | "brush" | "color-palette" | "lettering" | "other";

export interface ProjectAsset {
  id: string;
  kind: AssetKind;
  name: string;
  description?: string;
  blobKey?: string;
  tags: string[];
  approval: ApprovalState;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** IDs of assets this asset was derived from; supports provenance and impact analysis. */
  derivedFrom: string[];
  metadata: Record<string, unknown>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: AssetKind;
  version: number;
  approval: ApprovalState;
  tags: string[];
  /** Reusable, editable parameters. Keep geometry in data, not in model-generated prose. */
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  derivedFrom: string[];
}

export interface KuroProject {
  schemaVersion: 1;
  id: string;
  name: string;
  format: "kuro-project";
  createdAt: string;
  updatedAt: string;
  settings: {
    readingDirection: "ltr" | "rtl";
    unit: "px" | "mm";
    colorSpace: "srgb";
  };
  assets: ProjectAsset[];
  templates: ProjectTemplate[];
  metadata: Record<string, unknown>;
}

export function createProject(name: string): KuroProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled project",
    format: "kuro-project",
    createdAt: now,
    updatedAt: now,
    settings: { readingDirection: "ltr", unit: "px", colorSpace: "srgb" },
    assets: [],
    templates: [],
    metadata: {},
  };
}

export function validateProject(value: unknown): value is KuroProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<KuroProject>;
  return p.format === "kuro-project"
    && p.schemaVersion === 1
    && typeof p.id === "string"
    && typeof p.name === "string"
    && Array.isArray(p.assets)
    && Array.isArray(p.templates)
    && !!p.settings
    && ["ltr", "rtl"].includes(p.settings.readingDirection)
    && p.settings.colorSpace === "srgb";
}
