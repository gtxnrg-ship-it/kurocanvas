import { describe, expect, it } from "vitest";
import {
  createDrawingPlanTimeline,
  settleDrawingPlanTimeline,
  transitionDrawingPlanStep,
} from "./planTimeline";

describe("native drawing plan timeline", () => {
  it("preserves plan order and gives creator-readable labels", () => {
    const steps = createDrawingPlanTimeline([
      { id: "stroke-1", type: "stroke.add", shape: "bubble" },
      { id: "layer-2", type: "layer.add", layerId: "layer-2", name: "Inks" },
      { id: "hide-3", type: "layer.setVisibility", layerId: "layer-1", visible: false },
      { id: "opacity-4", type: "layer.setOpacity", layerId: "layer-2", opacity: 0.45 },
      { id: "move-5", type: "layer.reorder", layerId: "layer-2", index: 0 },
    ]);

    expect(steps.map(step => step.index)).toEqual([0, 1, 2, 3, 4]);
    expect(steps.map(step => step.status)).toEqual(Array(5).fill("pending"));
    expect(steps.map(step => step.label)).toEqual([
      "Add bubble",
      "Add layer “Inks”",
      "Hide layer layer-1",
      "Set opacity of layer layer-2 to 45%",
      "Reorder layer layer-2 to position 1",
    ]);
  });

  it("rejects missing and duplicate command IDs so React keys remain stable", () => {
    expect(() => createDrawingPlanTimeline([{ id: "", type: "stroke.add" }])).toThrow(/command ID/i);
    expect(() => createDrawingPlanTimeline([
      { id: "same", type: "stroke.add" },
      { id: "same", type: "layer.add" },
    ])).toThrow(/unique/i);
  });

  it("requires each step to follow the running-complete lifecycle", () => {
    let steps = createDrawingPlanTimeline([{ id: "a", type: "stroke.add" }]);
    expect(() => transitionDrawingPlanStep(steps, 0, "complete")).toThrow(/Cannot transition/i);
    steps = transitionDrawingPlanStep(steps, 0, "start");
    steps = transitionDrawingPlanStep(steps, 0, "complete", "Saved and read back");
    expect(steps[0]).toMatchObject({ status: "completed", detail: "Saved and read back" });
    expect(() => transitionDrawingPlanStep(steps, 0, "start")).toThrow(/Cannot transition/i);
  });

  it("records failure and cancellation without falsely claiming completion", () => {
    let steps = createDrawingPlanTimeline([
      { id: "a", type: "stroke.add" },
      { id: "b", type: "stroke.add" },
      { id: "c", type: "layer.add" },
    ]);
    steps = transitionDrawingPlanStep(steps, 0, "start");
    steps = transitionDrawingPlanStep(steps, 0, "complete", "Persisted and verified");
    steps = transitionDrawingPlanStep(steps, 1, "start");
    steps = transitionDrawingPlanStep(steps, 1, "fail", "Read-back mismatch");

    const rolledBack = settleDrawingPlanTimeline(steps, "rolled-back", "Original canvas restored and verified");
    expect(rolledBack.map(step => step.status)).toEqual(["rolled-back", "failed", "cancelled"]);
    expect(rolledBack[0].detail).toContain("restored and verified");
    expect(rolledBack[1].detail).toBe("Read-back mismatch");
  });

  it("keeps persisted steps completed when rollback is skipped to protect newer work", () => {
    let steps = createDrawingPlanTimeline([
      { id: "a", type: "stroke.add" },
      { id: "b", type: "stroke.add" },
    ]);
    steps = transitionDrawingPlanStep(steps, 0, "start");
    steps = transitionDrawingPlanStep(steps, 0, "complete");
    steps = transitionDrawingPlanStep(steps, 1, "start");
    steps = transitionDrawingPlanStep(steps, 1, "fail");
    const settled = settleDrawingPlanTimeline(steps, "stopped", "Newer saved work may exist; rollback skipped");
    expect(settled.map(step => step.status)).toEqual(["completed", "failed"]);
    expect(settled[0].detail).toContain("rollback skipped");
  });

  it("can mark pending and running steps cancelled when the creator stops a plan", () => {
    let steps = createDrawingPlanTimeline([
      { id: "a", type: "stroke.add" },
      { id: "b", type: "stroke.add" },
    ]);
    steps = transitionDrawingPlanStep(steps, 0, "start");
    const settled = settleDrawingPlanTimeline(steps, "stopped", "Cancelled by creator");
    expect(settled.map(step => step.status)).toEqual(["cancelled", "cancelled"]);
  });
});
