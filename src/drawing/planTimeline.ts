export type DrawingPlanStepStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "rolled-back";

export interface DrawingPlanStep {
  id: string;
  index: number;
  commandType: string;
  label: string;
  status: DrawingPlanStepStatus;
  detail?: string;
}

export interface DrawingPlanCommandSummary {
  id: string;
  type: string;
  shape?: string;
  strokeId?: string;
  layerId?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  index?: number;
}

export type DrawingPlanStepEvent = "start" | "complete" | "fail" | "cancel" | "rollback";

function describeCommand(command: DrawingPlanCommandSummary): string {
  const layer = command.layerId ? "layer " + command.layerId : "layer";
  const stroke = command.strokeId ? "stroke " + command.strokeId : "stroke";
  switch (command.type) {
    case "stroke.add":
      return "Add " + (command.shape && command.shape !== "freehand" ? command.shape : "freehand stroke");
    case "stroke.remove":
      return "Remove " + stroke;
    case "stroke.update":
      return "Edit " + stroke;
    case "stroke.transform":
      return "Transform " + stroke;
    case "layer.add":
      return "Add layer" + (command.name?.trim() ? " “" + command.name.trim().slice(0, 80) + "”" : "");
    case "layer.remove":
      return "Remove " + layer;
    case "layer.rename":
      return "Rename " + layer;
    case "layer.reorder":
      return "Reorder " + layer + (Number.isInteger(command.index) ? " to position " + (Number(command.index) + 1) : "");
    case "layer.setVisibility":
      return (command.visible ? "Show " : "Hide ") + layer;
    case "layer.setOpacity":
      return "Set opacity of " + layer + (Number.isFinite(command.opacity) ? " to " + Math.round(Number(command.opacity) * 100) + "%" : "");
    case "layer.setLock":
      return (command.locked ? "Lock " : "Unlock ") + layer;
    default:
      return command.type.replace(/[._-]+/g, " ").slice(0, 120) || "Native drawing action";
  }
}

/** Build an ordered, inspectable timeline from the exact validated plan shown to the creator. */
export function createDrawingPlanTimeline(commands: readonly DrawingPlanCommandSummary[]): DrawingPlanStep[] {
  const seen = new Set<string>();
  return commands.map((command, index) => {
    if (!command || typeof command.id !== "string" || !command.id.trim()) {
      throw new Error("Every drawing timeline step needs a command ID.");
    }
    if (seen.has(command.id)) throw new Error("Drawing timeline command IDs must be unique.");
    seen.add(command.id);
    if (typeof command.type !== "string" || !command.type.trim()) {
      throw new Error("Every drawing timeline step needs a command type.");
    }
    return {
      id: command.id,
      index,
      commandType: command.type,
      label: describeCommand(command),
      status: "pending",
    };
  });
}

const ALLOWED_TRANSITIONS: Record<DrawingPlanStepStatus, readonly DrawingPlanStepStatus[]> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: ["rolled-back"],
  failed: [],
  cancelled: [],
  "rolled-back": [],
};

/** Transition a single step without mutating the previous timeline snapshot. */
export function transitionDrawingPlanStep(
  steps: readonly DrawingPlanStep[],
  index: number,
  event: DrawingPlanStepEvent,
  detail?: string,
): DrawingPlanStep[] {
  if (!Number.isSafeInteger(index) || index < 0 || index >= steps.length) {
    throw new Error("Unknown drawing timeline step.");
  }
  const step = steps[index];
  const nextStatus: DrawingPlanStepStatus = event === "start" ? "running"
    : event === "complete" ? "completed"
    : event === "fail" ? "failed"
    : event === "cancel" ? "cancelled"
    : "rolled-back";
  if (!ALLOWED_TRANSITIONS[step.status].includes(nextStatus)) {
    throw new Error("Cannot transition a " + step.status + " drawing step to " + nextStatus + ".");
  }
  return steps.map((item, itemIndex) => itemIndex === index
    ? { ...item, status: nextStatus, ...(detail ? { detail: detail.slice(0, 320) } : { detail: undefined }) }
    : item);
}

/**
 * Finalize the remaining statuses after the enclosing plan stops. Only use
 * "rolled-back" when storage read-back confirmed that the original document won.
 */
export function settleDrawingPlanTimeline(
  steps: readonly DrawingPlanStep[],
  outcome: "rolled-back" | "stopped",
  detail: string,
): DrawingPlanStep[] {
  const safeDetail = detail.slice(0, 320);
  return steps.map(step => {
    if (outcome === "rolled-back" && step.status === "completed") {
      return { ...step, status: "rolled-back", detail: safeDetail };
    }
    if (step.status === "pending" || step.status === "running") {
      return { ...step, status: "cancelled", detail: safeDetail };
    }
    if (outcome === "stopped" && step.status === "completed") {
      return { ...step, detail: safeDetail };
    }
    return step;
  });
}
