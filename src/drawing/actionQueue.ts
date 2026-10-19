export type DrawingActionStatus =
  | "planned"
  | "awaiting-approval"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected";

export interface DrawingActionRecord {
  id: string;
  title: string;
  description: string;
  commandId: string;
  status: DrawingActionStatus;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export type DrawingActionEvent =
  | { type: "approval.request"; actionId: string }
  | { type: "approval.grant"; actionId: string }
  | { type: "approval.reject"; actionId: string }
  | { type: "execution.start"; actionId: string }
  | { type: "execution.complete"; actionId: string }
  | { type: "execution.fail"; actionId: string; error: string }
  | { type: "execution.cancel"; actionId: string };

/** Legal transitions are explicit so UI buttons cannot silently fake completion. */
const ALLOWED: Record<DrawingActionStatus, readonly DrawingActionStatus[]> = {
  planned: ["awaiting-approval", "ready", "cancelled"],
  "awaiting-approval": ["ready", "rejected", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["ready", "cancelled"],
  cancelled: [],
  rejected: [],
};

export function canTransitionAction(from: DrawingActionStatus, to: DrawingActionStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transitionDrawingAction(
  action: DrawingActionRecord,
  event: DrawingActionEvent,
): DrawingActionRecord {
  if (event.actionId !== action.id) throw new Error("Action event ID does not match the target action.");
  let next: DrawingActionStatus;
  let error: string | undefined;

  switch (event.type) {
    case "approval.request":
      if (!action.requiresApproval) throw new Error("This action does not require approval.");
      next = "awaiting-approval";
      break;
    case "approval.grant":
      if (action.status !== "awaiting-approval") throw new Error("Only an action awaiting approval can be approved.");
      next = "ready";
      break;
    case "approval.reject":
      if (action.status !== "awaiting-approval") throw new Error("Only an action awaiting approval can be rejected.");
      next = "rejected";
      break;
    case "execution.start":
      if (action.requiresApproval && action.status !== "ready") throw new Error("Approval is required before execution.");
      if (!action.requiresApproval && action.status !== "ready") throw new Error("Action must be ready before execution.");
      next = "running";
      break;
    case "execution.complete":
      if (action.status !== "running") throw new Error("Only a running action can complete.");
      next = "completed";
      break;
    case "execution.fail":
      if (action.status !== "running") throw new Error("Only a running action can fail.");
      next = "failed";
      error = event.error.slice(0, 1000);
      break;
    case "execution.cancel":
      if (!canTransitionAction(action.status, "cancelled")) throw new Error("This action cannot be cancelled from its current state.");
      next = "cancelled";
      break;
  }

  if (!canTransitionAction(action.status, next)) {
    throw new Error("Invalid action transition: " + action.status + " -> " + next);
  }
  return {
    ...action,
    status: next,
    updatedAt: new Date().toISOString(),
    ...(error ? { error } : next === "failed" ? {} : { error: undefined }),
  };
}

export function createDrawingAction(input: {
  id: string;
  title: string;
  description: string;
  commandId: string;
  requiresApproval: boolean;
}): DrawingActionRecord {
  const now = new Date().toISOString();
  return {
    ...input,
    status: input.requiresApproval ? "planned" : "ready",
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizeDrawingQueue(actions: readonly DrawingActionRecord[]) {
  return actions.reduce((summary, action) => {
    summary[action.status] = (summary[action.status] ?? 0) + 1;
    return summary;
  }, {} as Partial<Record<DrawingActionStatus, number>>);
}
