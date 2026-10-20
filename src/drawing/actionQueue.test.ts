import { describe, expect, it } from "vitest";
import { createDrawingAction, transitionDrawingAction, transitionDrawingActions } from "./actionQueue";

const action = (id: string, requiresApproval = true) =>
  createDrawingAction({ id, title: "Draw", description: "Draw a stroke", commandId: "command-" + id, requiresApproval });

describe("drawing action queue", () => {
  it("requires explicit approval before protected execution", () => {
    const planned = action("a");
    expect(planned.status).toBe("planned");
    expect(() => transitionDrawingAction(planned, { type: "execution.start", actionId: "a" })).toThrow();
    const pending = transitionDrawingAction(planned, { type: "approval.request", actionId: "a" });
    const ready = transitionDrawingAction(pending, { type: "approval.grant", actionId: "a" });
    expect(transitionDrawingAction(ready, { type: "execution.start", actionId: "a" }).status).toBe("running");
  });

  it("does not allow completion before execution starts", () => {
    expect(() => transitionDrawingAction(action("a", false), { type: "execution.complete", actionId: "a" })).toThrow();
  });

  it("caps persisted error details and clears stale errors on recovery", () => {
    const running = transitionDrawingAction(action("a", false), { type: "execution.start", actionId: "a" });
    const failed = transitionDrawingAction(running, { type: "execution.fail", actionId: "a", error: "x".repeat(1500) });
    expect(failed.error).toHaveLength(1000);
    const retried = transitionDrawingAction(failed, { type: "execution.cancel", actionId: "a" });
    expect(retried.error).toBeUndefined();
  });

  it("transitions multiple actions atomically and preserves queue order", () => {
    const queue = [action("a"), action("b", false)];
    const result = transitionDrawingActions(queue, [
      { type: "approval.request", actionId: "a" },
      { type: "execution.start", actionId: "b" },
    ]);
    expect(result.map(item => item.id)).toEqual(["a", "b"]);
    expect(result.map(item => item.status)).toEqual(["awaiting-approval", "running"]);
    expect(queue.map(item => item.status)).toEqual(["planned", "ready"]);
  });

  it("rejects an invalid batch without exposing partial updates", () => {
    const queue = [action("a"), action("b", false)];
    expect(() => transitionDrawingActions(queue, [
      { type: "approval.request", actionId: "a" },
      { type: "execution.complete", actionId: "b" },
    ])).toThrow(/Only a running action can complete/);
    expect(queue.map(item => item.status)).toEqual(["planned", "ready"]);
  });

  it("rejects unknown or repeated action IDs in a batch", () => {
    const queue = [action("a")];
    expect(() => transitionDrawingActions(queue, [{ type: "approval.request", actionId: "missing" }])).toThrow(/Unknown drawing action ID/);
    expect(() => transitionDrawingActions(queue, [
      { type: "approval.request", actionId: "a" },
      { type: "execution.cancel", actionId: "a" },
    ])).toThrow(/only be transitioned once/);
  });
  it("allows an explicit retry only after failure and clears the old error", () => {
    const running = transitionDrawingAction(action("retry", false), { type: "execution.start", actionId: "retry" });
    const failed = transitionDrawingAction(running, { type: "execution.fail", actionId: "retry", error: "temporary canvas error" });
    const ready = transitionDrawingAction(failed, { type: "execution.retry", actionId: "retry" });
    expect(ready.status).toBe("ready");
    expect(ready.error).toBeUndefined();
    expect(() => transitionDrawingAction(action("not-failed", false), { type: "execution.retry", actionId: "not-failed" })).toThrow(/Only a failed action can be retried/);
  });

});