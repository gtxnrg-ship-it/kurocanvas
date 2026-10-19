import { describe, expect, it } from "vitest";
import { createDrawingAction, transitionDrawingAction } from "./actionQueue";

describe("drawing action queue", () => {
  it("requires explicit approval before protected execution", () => {
    const action = createDrawingAction({ id: "a", title: "Draw", description: "Draw a stroke", commandId: "c", requiresApproval: true });
    expect(action.status).toBe("planned");
    expect(() => transitionDrawingAction(action, { type: "execution.start", actionId: "a" })).toThrow();
    const pending = transitionDrawingAction(action, { type: "approval.request", actionId: "a" });
    const ready = transitionDrawingAction(pending, { type: "approval.grant", actionId: "a" });
    expect(transitionDrawingAction(ready, { type: "execution.start", actionId: "a" }).status).toBe("running");
  });
  it("does not allow completion before execution starts", () => {
    const action = createDrawingAction({ id: "a", title: "Draw", description: "Draw", commandId: "c", requiresApproval: false });
    expect(() => transitionDrawingAction(action, { type: "execution.complete", actionId: "a" })).toThrow();
  });
});
