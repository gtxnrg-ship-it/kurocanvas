import {
  ModelRegistry,
  type ModelRequest,
  type ModelResponse,
  type ModelRole,
  type ModelSelectionContext,
} from "./modelRegistry";

export type CreativeTaskKind = "draw" | "story" | "continuity" | "research" | "project-management" | "general";

export interface CreativeTask {
  id: string;
  kind: CreativeTaskKind;
  userRequest: string;
  projectId?: string;
  constraints: string[];
  createdAt: string;
}

export interface PlannedAction {
  id: string;
  title: string;
  description: string;
  toolName: string;
  input: unknown;
  risk: "safe" | "review" | "destructive";
  requiresApproval: boolean;
  expectedOutcome: string;
}

export interface CreativePlan {
  taskId: string;
  summary: string;
  actions: PlannedAction[];
  assumptions: string[];
  unresolvedQuestions: string[];
  status: "proposed" | "approved" | "executing" | "completed" | "failed" | "cancelled";
  createdAt: string;
}

export interface TaskRoutingRule {
  kind: CreativeTaskKind;
  role: ModelRole;
  requiredCapabilities?: Array<"chat" | "structured-output" | "tool-calling" | "vision" | "embeddings" | "streaming">;
}

export const DEFAULT_TASK_ROUTING: TaskRoutingRule[] = [
  { kind: "draw", role: "planning", requiredCapabilities: ["chat"] },
  { kind: "story", role: "story-writing", requiredCapabilities: ["chat"] },
  { kind: "continuity", role: "continuity", requiredCapabilities: ["chat"] },
  { kind: "research", role: "research", requiredCapabilities: ["chat"] },
  { kind: "project-management", role: "planning", requiredCapabilities: ["chat"] },
  { kind: "general", role: "reasoning", requiredCapabilities: ["chat"] },
];

export interface PlanningAdapter {
  plan(task: CreativeTask, context: { role: ModelRole; modelId: string }): Promise<CreativePlan>;
}

export interface OrchestratorOptions {
  selection: ModelSelectionContext;
  routing?: TaskRoutingRule[];
  planningAdapter?: PlanningAdapter;
}

export class KuroOrchestrator {
  constructor(private readonly registry: ModelRegistry, private readonly options: OrchestratorOptions) {}

  async plan(task: CreativeTask): Promise<CreativePlan> {
    if (!task.userRequest.trim()) throw new Error("A task request cannot be empty.");
    const rule = (this.options.routing ?? DEFAULT_TASK_ROUTING).find(item => item.kind === task.kind);
    if (!rule) throw new Error("No routing rule is configured for task kind: " + task.kind);
    const selection = this.registry.select(rule.role, {
      ...this.options.selection,
      require: [...new Set([...(this.options.selection.require ?? []), ...(rule.requiredCapabilities ?? [])])],
    });
    if (!selection) throw new Error("No enabled, installed model can handle the " + rule.role + " role under the current device and privacy settings.");
    if (!this.options.planningAdapter) {
      throw new Error("No planning adapter is connected. Register a model provider and a planning adapter before asking Kuro to execute creative work.");
    }
    const plan = await this.options.planningAdapter.plan(task, { role: rule.role, modelId: selection.model.id });
    if (plan.taskId !== task.id) throw new Error("The planner returned a plan for a different task.");
    if (plan.actions.some(action => !action.toolName || typeof action.input === "undefined")) {
      throw new Error("The planner returned an action without a tool name or input.");
    }
    return plan;
  }
}

/** Small adapter helper for providers that return text; it does not execute tools. */
export function createTextPlanningAdapter(
  generate: (request: ModelRequest, modelId: string) => Promise<ModelResponse>,
  modelId: string,
): PlanningAdapter {
  return {
    async plan(task) {
      const response = await generate({
        role: "planning",
        responseFormat: "json",
        messages: [
          { role: "system", content: "Return a JSON object matching CreativePlan. Propose actions only; never claim actions have been executed. Mark destructive or consequential actions as requiring approval." },
          { role: "user", content: JSON.stringify(task) },
        ],
      }, modelId);
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        throw new Error("The planning model did not return valid JSON.");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("The planning model returned an invalid plan object.");
      }
      const plan = parsed as CreativePlan;
      if (typeof plan.taskId !== "string" || !Array.isArray(plan.actions) || typeof plan.summary !== "string") {
        throw new Error("The planning model returned a plan with an invalid schema.");
      }
      return plan;
    },
  };
}
