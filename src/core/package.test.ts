import { describe, expect, it } from "vitest";
import { createProject } from "./project";
import { createKuroPackage, parseKuroPackage, serializeKuroPackage } from "./package";

describe("portable Kuro packages", () => {
  it("round-trips Story Vault and editable drawing assets", () => {
    const project = createProject("The Silver Oath");
    const assets = {
      "kuro/story-memory.v1.json": JSON.stringify([{ id: "chapter-12", status: "approved" }]),
      "kuro/art-direction.v1.json": JSON.stringify({ schemaVersion: 1, projectId: project.id, title: "Locked style", influences: [] }),
      "kuro/style-bible.v1.json": JSON.stringify({ schemaVersion: 1, projectId: project.id, title: "Timeline", inspirations: [], rules: [], characterStates: [] }),
      "kuro/references.v1.json": JSON.stringify([{ id: "reference-1", projectId: project.id, sourceUrl: "https://commons.wikimedia.org/wiki/File:Rain.jpg", status: "approved" }]),
      "kuro/character-models.v1.json": JSON.stringify([{ id: "model-1", projectId: project.id, sourceType: "uploaded-glb", modelDataUrl: "data:model/gltf-binary;base64,QUJDREVGRw==" }]),
      "kuro/canon.v1.json": JSON.stringify({ schemaVersion: 1, projectId: project.id, entities: [], facts: [] }),
      "kuro/drawings/drawing-1.json": JSON.stringify({ id: "drawing-1", version: 1, strokes: [] }),
    };
    const result = parseKuroPackage(serializeKuroPackage(createKuroPackage(project, assets)));
    expect(result.project.name).toBe("The Silver Oath");
    expect(result.assets).toEqual(assets);
  });

  it("rejects invalid asset entries", () => {
    const project = createProject("Broken export");
    expect(() => createKuroPackage(project, { "": "invalid key" })).toThrow(/non-empty keys/i);
  });
});

describe("native Kuro ZIP packages", () => {
  it("round-trips project metadata and every packaged asset", async () => {
    const { parseKuroArchive, serializeKuroArchive } = await import("./package");
    const project = createProject("Rain City");
    const assets = {
      "kuro/story-memory.v1.json": JSON.stringify([{ chapterNumber: 1, title: "The Promise" }]),
      "kuro/drawings/panel-1.json": JSON.stringify({ width: 1600, strokes: [{ id: "s1" }] }),
      "kuro/character-models.v1.json": JSON.stringify([{ modelDataUrl: "data:model/gltf-binary;base64,QUJD" }]),
    };
    const restored = parseKuroArchive(serializeKuroArchive(createKuroPackage(project, assets)));
    expect(restored.project.name).toBe("Rain City");
    expect(restored.assets).toEqual(assets);
  });
  it("rejects corrupted or unrelated archive content", async () => {
    const { parseKuroArchive, serializeKuroArchive } = await import("./package");
    const bytes = serializeKuroArchive(createKuroPackage(createProject("Integrity")));
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => parseKuroArchive(bytes)).toThrow();
  });
});
