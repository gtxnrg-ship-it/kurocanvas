import { describe, expect, it } from "vitest";
import { dataUrlToBlob, resolveActiveScarOverlays, selectCharacterModelVariant, validateCharacterModel, type CharacterModelRecord } from "./characterModels";

const base = (overrides: Partial<CharacterModelRecord> = {}): CharacterModelRecord => ({
  id: "model-1", projectId: "project-1", characterName: "Ren", sourceType: "procedural", fileName: "",
  frontFace: "positive-z", scarOverlays: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("3D character model records", () => {
  it("validates a project-scoped procedural blockout", () => {
    expect(validateCharacterModel(base(), "project-1")).toEqual([]);
    expect(validateCharacterModel(base(), "other-project").join(" ")).toContain("different project");
  });

  it("validates and persists native procedural appearance traits", () => {
    const traits = { hair: "short black hair", age: "17", outfit: "dark school uniform", skinTone: "tan", eyeColor: "amber", bodyType: "athletic" as const };
    expect(validateCharacterModel(base({ proceduralTraits: traits }), "project-1")).toEqual([]);
    expect(validateCharacterModel(base({ proceduralTraits: { ...traits, bodyType: "impossible" as never } })).join(" ")).toMatch(/body type|procedural traits/i);
    expect(validateCharacterModel(base({ proceduralTraits: { ...traits, hair: "x".repeat(161) } })).join(" ")).toMatch(/hair/i);
  });

  it("requires a real bounded GLB blob for uploaded models", () => {
    const missing = base({ sourceType: "uploaded-glb", fileName: "ren.glb" });
    expect(validateCharacterModel(missing).join(" ")).toContain("GLB blobs");
    const blob = new Blob(["valid-ish-glb-payload"], { type: "model/gltf-binary" });
    expect(validateCharacterModel(base({ sourceType: "uploaded-glb", fileName: "ren.glb", modelBlob: blob }))).toEqual([]);
  });

  it("selects the latest available model variant without leaking future designs into flashbacks", () => {
    const baseModel = base({ id: "base", storyOrder: 0 });
    const chapter12 = base({ id: "chapter-12", characterStateId: "state-12", storyOrder: 12, fileName: "ren-18.glb", sourceType: "uploaded-glb", modelBlob: new Blob(["glb-data-12"]) });
    const chapter20 = base({ id: "chapter-20", characterStateId: "state-20", storyOrder: 20, fileName: "ren-19.glb", sourceType: "uploaded-glb", modelBlob: new Blob(["glb-data-20"]) });
    expect(selectCharacterModelVariant([baseModel, chapter12, chapter20], "Ren", 1)?.id).toBe("base");
    expect(selectCharacterModelVariant([baseModel, chapter12, chapter20], "Ren", 15)?.id).toBe("chapter-12");
    expect(selectCharacterModelVariant([chapter12, chapter20], "Ren", 1)).toBeUndefined();
  });

  it("requires chapter-specific model variants to link to a finite approved-state order", () => {
    const variant = base({ characterStateId: "state-12", storyOrder: 12, fileName: "ren-ch12.glb" });
    expect(validateCharacterModel(variant)).toEqual([]);
    expect(validateCharacterModel(base({ characterStateId: "state-12" })).join(" ")).toContain("state ID and story order");
  });

  it("preserves the introduction and removal order for scar overlays", () => {
    const scar = { id: "scar-1", characterStateId: "state-12", introducedAtOrder: 12, removedAtOrder: 14, label: "Left eyebrow", x: 0.1, y: 0.34, z: 0.5, length: 0.08, angle: 45, color: "#8b343b" };
    expect(validateCharacterModel(base({ scarOverlays: [scar] }))).toEqual([]);
    expect(validateCharacterModel(base({ scarOverlays: [{ ...scar, removedAtOrder: 12 }] })).join(" ")).toContain("scar overlay");
  });

  it("keeps scars visible after introduction, hides them after an approved removal, and never resurrects old scars", () => {
    const oldScar = { id:"scar-old", characterStateId:"state-12", introducedAtOrder:12, label:"Old scar", x:0, y:0.3, z:0.5, length:0.08, angle:30, color:"#8b343b" };
    const newScar = { ...oldScar, id:"scar-new", characterStateId:"state-15", introducedAtOrder:15, label:"New scar" };
    const states = [
      { characterName:"Ren", storyOrder:1, chapterLabel:"Chapter 1", status:"approved", scars:"none" },
      { characterName:"Ren", storyOrder:12, chapterLabel:"Chapter 12", status:"approved", scars:"thin scar across left eyebrow" },
      { characterName:"Ren", storyOrder:14, chapterLabel:"Chapter 14", status:"approved", scars:"none" },
      { characterName:"Ren", storyOrder:15, chapterLabel:"Chapter 15", status:"approved", scars:"small scar on cheek" },
    ];
    expect(resolveActiveScarOverlays([oldScar], states, "Ren", 13, "thin scar across left eyebrow")).toHaveLength(1);
    expect(resolveActiveScarOverlays([oldScar], states, "Ren", 14, "none")).toHaveLength(0);
    expect(resolveActiveScarOverlays([oldScar,newScar], states, "Ren", 15, "small scar on cheek").map(scar=>scar.id)).toEqual(["scar-new"]);
  });

  it("decodes portable base64 model blobs without losing their MIME type", () => {
    const blob = dataUrlToBlob("data:model/gltf-binary;base64,QUJDREVGRw==");
    expect(blob.type).toBe("model/gltf-binary");
    expect(blob.size).toBe(7);
  });
});
