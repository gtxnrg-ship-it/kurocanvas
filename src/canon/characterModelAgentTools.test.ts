import { describe, expect, it } from "vitest";
import { describeCharacterModelAgentCommand, isCharacterModelToolRequest, parseCharacterModelAgentPlan } from "./characterModelAgentTools";

describe("native character-model viewport tools", () => {
  it("recognizes explicit model camera requests without treating ordinary writing as a tool call", () => {
    expect(isCharacterModelToolRequest("Move the camera to a three-quarter view of this 3D character.")).toBe(true);
    expect(isCharacterModelToolRequest("Zoom in on the character model.")).toBe(true);
    expect(isCharacterModelToolRequest("Write a scene where the character turns toward the door.")).toBe(false);
  });

  it("parses allowed camera actions and summarizes them as real viewport operations", () => {
    const plan = parseCharacterModelAgentPlan(JSON.stringify({
      summary: "Inspect the same model from its left side, then zoom in.",
      commands: [
        { version: 1, id: "camera-1", type: "camera.preset", preset: "profile-left" },
        { version: 1, id: "camera-2", type: "camera.zoom", factor: 1.35 },
        { version: 1, id: "rotate-1", type: "model.rotateView", degrees: 25 },
      ],
    }));
    expect(plan.commands).toHaveLength(3);
    expect(describeCharacterModelAgentCommand(plan.commands[0])).toContain("profile left");
    expect(describeCharacterModelAgentCommand(plan.commands[1])).toContain("Zoom in");
    expect(describeCharacterModelAgentCommand(plan.commands[2])).toContain("view only");
  });

  it.each([
    JSON.stringify({ summary: "unknown", commands: [{ version: 1, id: "x", type: "write.code", code: "evil" }] }),
    JSON.stringify({ summary: "bad zoom", commands: [{ version: 1, id: "x", type: "camera.zoom", factor: 99 }] }),
    JSON.stringify({ summary: "bad preset", commands: [{ version: 1, id: "x", type: "camera.preset", preset: "secret-camera" }] }),
    JSON.stringify({ summary: "bad rotation", commands: [{ version: 1, id: "x", type: "model.rotateView", degrees: 999 }] }),
    JSON.stringify({ summary: "duplicate IDs", commands: [
      { version: 1, id: "x", type: "camera.preset", preset: "front" },
      { version: 1, id: "x", type: "camera.preset", preset: "back" },
    ] }),
  ])("rejects invalid or out-of-scope commands", raw => {
    expect(() => parseCharacterModelAgentPlan(raw)).toThrow();
  });

  it("rejects malformed, over-sized, and too many commands", () => {
    expect(() => parseCharacterModelAgentPlan("{")).toThrow(/valid JSON/i);
    expect(() => parseCharacterModelAgentPlan(JSON.stringify({ summary: " ", commands: [] }))).toThrow(/summary/i);
    expect(() => parseCharacterModelAgentPlan(JSON.stringify({ summary: "too many", commands: Array.from({ length: 9 }, (_, i) => ({ version: 1, id: String(i), type: "camera.preset", preset: "front" })) }))).toThrow(/at most 8/i);
    expect(() => parseCharacterModelAgentPlan("x".repeat(24_001))).toThrow(/response-size/i);
  });
});
