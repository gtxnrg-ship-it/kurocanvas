import { describe, expect, it } from "vitest";
import { AI_PLAN_MAX_ACTIONS, AI_PLAN_MAX_POINTS_PER_STROKE, AI_PLAN_MAX_TOTAL_POINTS, parseAIStrokePlan, requestAIStrokePlan } from "./aiPlan";

const stroke = {
  version: 1, id: "stroke-1", type: "stroke.add", layerId: "layer-default",
  tool: "brush", color: "#112233", size: 4,
  points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 30, y: 40, pressure: 0.8 }],
};

describe("parseAIStrokePlan", () => {
  it("accepts a bounded native stroke plan", () => {
    expect(parseAIStrokePlan(JSON.stringify({ summary: "A small sketch", commands: [stroke] }))).toMatchObject({
      summary: "A small sketch",
      commands: [{ type: "stroke.add", id: "stroke-1" }],
    });
  });

  it("recovers fenced drawing JSON but still validates every native command", () => {
    const raw = 'I prepared a plan:\n\`\`\`json\n' + JSON.stringify({ summary: "A small sketch", commands: [stroke] }) + '\n\`\`\`';
    expect(parseAIStrokePlan(raw).commands).toMatchObject([{ type: "stroke.add", id: "stroke-1" }]);
    const unsafe = 'Plan:\n\`\`\`json\n' + JSON.stringify({ summary: "Run code", commands: [{ ...stroke, type: "script.execute" }] }) + '\n\`\`\`';
    expect(() => parseAIStrokePlan(unsafe)).toThrow(/approved native/i);
  });

  it("rejects malformed JSON and non-object payloads", () => {
    expect(() => parseAIStrokePlan("{")).toThrow(/valid JSON/i);
    expect(() => parseAIStrokePlan("[]")).toThrow(/JSON object/i);
  });

  it("rejects unsupported commands before approval", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, type: "arbitrary.code" }] }))).toThrow(/approved native/i);
  });

  it("accepts only existing-stroke removal and safe layer property actions", () => {
    const bounds = { width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [], strokeLayerById: { "existing-1": "ink" } };
    const remove = { version: 1, id: "remove-1", type: "stroke.remove", strokeId: "existing-1" };
    const opacity = { version: 1, id: "opacity-1", type: "layer.setOpacity", layerId: "ink", opacity: 0.5 };
    const update = { version: 1, id: "edit-1", type: "stroke.update", strokeId: "existing-1", patch: { color: "#abcdef" } };
    expect(parseAIStrokePlan(JSON.stringify({ summary: "Edit the stroke, then remove it", commands: [opacity, update, remove] }), bounds).commands).toHaveLength(3);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "Cannot edit after removal", commands: [remove, update] }), bounds)).toThrow(/not in the active document/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...remove, strokeId: "missing" }] }), bounds)).toThrow(/not in the active document/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...update, strokeId: "missing" }] }), bounds)).toThrow(/not in the active document/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...remove, id: "remove-2" }] }), { ...bounds, lockedLayerIds: ["ink"] })).toThrow(/locked layer/i);
  });
  it("accepts native transforms only with explicit existing, unlocked stroke context", () => {
    const bounds = { width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [], strokeLayerById: { "existing-1": "ink" } };
    const transform = {
      version: 1, id: "transform-1", type: "stroke.transform", strokeId: "existing-1",
      translateX: 10, translateY: 15, scaleX: 2, scaleY: 1.5, rotationDegrees: 30,
    };
    expect(parseAIStrokePlan(JSON.stringify({ summary: "Rotate the selected line", commands: [transform] }), bounds).commands)
      .toMatchObject([{ type: "stroke.transform", strokeId: "existing-1", rotationDegrees: 30 }]);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "No document", commands: [transform] }), {
      width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [],
    })).toThrow(/active document context/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "Unknown object", commands: [{ ...transform, strokeId: "missing" }] }), bounds))
      .toThrow(/not in the active document/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "Locked object", commands: [transform] }), { ...bounds, lockedLayerIds: ["ink"] }))
      .toThrow(/locked layer/i);
  });

  it("proposes native layer creation followed by editable strokes", () => {
    const bounds = { width: 800, height: 600, layerIds: ["ink"], lockedLayerIds: [], strokeLayerById: {} };
    const plan = parseAIStrokePlan(JSON.stringify({
      summary: "Separate the foreground ink on a new layer",
      commands: [
        { version: 1, id: "create-details", type: "layer.add", layerId: "detail-ink", name: "Detail ink", index: 1 },
        { version: 1, id: "face-line", type: "stroke.add", layerId: "detail-ink", tool: "brush", color: "#112233", size: 3, points: [{ x: 40, y: 45, pressure: 0.7 }] },
        { version: 1, id: "rename-details", type: "layer.rename", layerId: "detail-ink", name: "Face details" },
      ],
    }), bounds);
    expect(plan.commands.map(command => command.type)).toEqual(["layer.add", "stroke.add", "layer.rename"]);
  });

  it("does not let the model fabricate internal layer-restoration commands", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({
      summary: "Fabricate a layer",
      commands: [{
        version: 1, id: "restore-layer", type: "layer.restore", index: 1,
        layer: { id: "invented", name: "Invented", visible: true, locked: false, opacity: 1, blendMode: "normal" },
      }],
    }))).toThrow(/approved native/i);
  });

  it("rejects out-of-bounds points and unknown layers", () => {
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, points: [{ x: 2000, y: 40 }] }] }))).toThrow(/rejected/i);
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "bad", commands: [{ ...stroke, layerId: "missing" }] }))).toThrow(/rejected/i);
  });

  it("keeps one generated batch within the realistic local output budget", () => {
    expect(AI_PLAN_MAX_ACTIONS).toBe(12);
    expect(AI_PLAN_MAX_POINTS_PER_STROKE).toBe(32);
    expect(AI_PLAN_MAX_TOTAL_POINTS).toBe(96);
    const expanded = Array.from({ length: 8 }, (_, i) => ({
      ...stroke, id: "s" + i,
      points: Array.from({ length: 10 }, (_, point) => ({ x: point, y: i })),
    }));
    expect(parseAIStrokePlan(JSON.stringify({ summary: "A compact first sketch batch", commands: expanded })).commands).toHaveLength(8);
    expect(() => parseAIStrokePlan(JSON.stringify({
      summary: "too many actions",
      commands: Array.from({ length: AI_PLAN_MAX_ACTIONS + 1 }, (_, i) => ({ ...stroke, id: "s" + i })),
    }))).toThrow(/12 native actions/i);
    expect(() => parseAIStrokePlan(JSON.stringify({
      summary: "too many points per stroke",
      commands: [{ ...stroke, points: Array.from({ length: AI_PLAN_MAX_POINTS_PER_STROKE + 1 }, (_, i) => ({ x: i, y: i })) }],
    }))).toThrow(/32 points/i);
    const pointHeavy = Array.from({ length: 4 }, (_, i) => ({
      ...stroke, id: "s" + i,
      points: Array.from({ length: 25 }, (_, point) => ({ x: point, y: i })),
    }));
    expect(() => parseAIStrokePlan(JSON.stringify({ summary: "over point budget", commands: pointHeavy }))).toThrow(/total point budget of 96/i);
    expect(() => parseAIStrokePlan(" ".repeat(512 * 1024 + 1))).toThrow(/response-size limit/i);
  });
});

describe("bounded AI drawing-plan repair", () => {
  it("repairs malformed model JSON once and revalidates the repaired native actions", async () => {
    let calls = 0;
    let capturedError = "";
    const result = await requestAIStrokePlan(async attempt => {
      calls++;
      if (attempt.mode === "initial") return "{ malformed";
      capturedError = attempt.validationError;
      expect(attempt.previousOutput).toBe("{ malformed");
      return JSON.stringify({ summary: "A small corrected sketch", commands: [stroke] });
    });
    expect(calls).toBe(2);
    expect(capturedError).toMatch(/valid JSON/i);
    expect(result).toMatchObject({ repaired: true, plan: { summary: "A small corrected sketch", commands: [{ type: "stroke.add" }] } });
  });

  it("does not retry a valid no-op plan that honestly declines an unsupported effect", async () => {
    let calls = 0;
    const result = await requestAIStrokePlan(async () => {
      calls++;
      return JSON.stringify({ summary: "This effect is outside the native tool set.", commands: [] });
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ repaired: false, plan: { commands: [] } });
  });

  it("stops after one invalid repair instead of looping or approving malformed work", async () => {
    let calls = 0;
    await expect(requestAIStrokePlan(async attempt => {
      calls++;
      return attempt.mode === "initial"
        ? JSON.stringify({ summary: "Bad first plan", commands: [{ ...stroke, layerId: "unknown" }] })
        : JSON.stringify({ summary: "Still bad", commands: [{ ...stroke, points: [{ x: 5000, y: 5000 }] }] });
    })).rejects.toThrow(/after one repair attempt/i);
    expect(calls).toBe(2);
  });

  it("reports when the repair generation itself fails", async () => {
    let calls = 0;
    await expect(requestAIStrokePlan(async attempt => {
      calls++;
      if (attempt.mode === "initial") return "{";
      throw new Error("provider offline");
    })).rejects.toThrow(/single repair attempt failed: provider offline/i);
    expect(calls).toBe(2);
  });
});
