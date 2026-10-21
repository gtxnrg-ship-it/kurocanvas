import { describe, expect, it } from "vitest";
import { verifyDrawingReadback } from "./drawingReadback";
import type { LocalDrawingDocument } from "../core/storage";

const document: LocalDrawingDocument = {
  id: "drawing-a", projectId: "project-a", name: "Opening panel", version: 1, width: 1600, height: 1200,
  background: "#fffdfb", updatedAt: "2026-01-01T00:00:00.000Z",
  layers: [{ id: "ink", name: "Ink", visible: true, locked: false, opacity: 1, blendMode: "normal" }],
  strokes: [{ id: "stroke-a", layerId: "ink", tool: "brush", color: "#112233", size: 4, points: [{ x: 12, y: 24, pressure: 0.6 }] }],
};

describe("agent drawing read-back verification", () => {
  it("accepts an exact persisted document even when storage updates the timestamp or key order", () => {
    const reordered = {
      strokes: [{ points: [{ pressure: 0.6, y: 24, x: 12 }], size: 4, color: "#112233", tool: "brush", layerId: "ink", id: "stroke-a" }],
      layers: [{ blendMode: "normal", opacity: 1, locked: false, visible: true, name: "Ink", id: "ink" }],
      background: "#fffdfb", height: 1200, width: 1600, version: 1, name: "Opening panel", id: "drawing-a", projectId: "project-a", updatedAt: "2026-01-02T00:00:00.000Z",
    } as LocalDrawingDocument;
    expect(verifyDrawingReadback(document, reordered)).toEqual({ ok: true });
  });

  it("fails closed when the write cannot be read back", () => {
    expect(verifyDrawingReadback(document, undefined)).toMatchObject({ ok: false, reason: expect.stringMatching(/could not be read back/) });
  });

  it("rejects a document read back from another project", () => {
    expect(verifyDrawingReadback(document, { ...document, projectId: "project-b" })).toMatchObject({ ok: false, reason: expect.stringMatching(/different project/) });
  });

  it("detects missing or changed editable strokes", () => {
    expect(verifyDrawingReadback(document, { ...document, strokes: [] })).toMatchObject({ ok: false, reason: expect.stringMatching(/editable strokes/) });
    expect(verifyDrawingReadback(document, { ...document, strokes: [{ ...document.strokes[0], color: "#abcdef" }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/editable strokes/) });
  });

  it("detects layer changes even when all strokes still exist", () => {
    expect(verifyDrawingReadback(document, { ...document, layers: [{ ...document.layers![0], locked: true }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/layer state/) });
  });

  it("detects an unexpected dimension or background change", () => {
    expect(verifyDrawingReadback(document, { ...document, width: 800 })).toMatchObject({ ok: false, reason: expect.stringMatching(/dimensions/) });
    expect(verifyDrawingReadback(document, { ...document, background: "#ffffff" })).toMatchObject({ ok: false, reason: expect.stringMatching(/background/) });
  });

  it("restores and verifies the pre-plan document when read-back detects bad persistence", async () => {
    const { saveDrawingWithReadback } = await import("./drawingReadback");
    const intended = { ...document, strokes: [...document.strokes, { ...document.strokes[0], id: "stroke-b" }] };
    let saved: LocalDrawingDocument = document;
    let firstWrite = true;
    const storage = {
      async save(next: LocalDrawingDocument) {
        if (firstWrite) {
          firstWrite = false;
          saved = { ...next, strokes: [...next.strokes].slice(1) };
        } else {
          saved = structuredClone(next);
        }
      },
      async load() { return structuredClone(saved); },
    };
    await expect(saveDrawingWithReadback(storage, document, intended)).rejects.toThrow(/previous artwork was restored and read back successfully/);
    expect(saved.strokes).toEqual(document.strokes);
  });

  it("does not claim rollback succeeded when recovery cannot be verified", async () => {
    const { saveDrawingWithReadback } = await import("./drawingReadback");
    const intended = { ...document, background: "#abcdef" };
    let saveCount = 0;
    const storage = {
      async save(next: LocalDrawingDocument) {
        saveCount++;
        if (saveCount > 1) throw new Error("storage quota");
      },
      async load() { return { ...intended, strokes: [] }; },
    };
    await expect(saveDrawingWithReadback(storage, document, intended)).rejects.toThrow(/rollback could not be verified/);
  });
});
