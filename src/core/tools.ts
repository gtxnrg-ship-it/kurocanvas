export type KuroToolName =
  | "canvas.createLayer"
  | "canvas.renameLayer"
  | "canvas.setLayerVisibility"
  | "canvas.setLayerLock"
  | "canvas.clear"
  | "project.createCharacter"
  | "project.addReference"
  | "story.addScene";

export type ToolRisk = "safe" | "review" | "destructive";
export type ToolApproval = "not-required" | "required";

export interface KuroToolDefinition<TInput = unknown, TOutput = unknown> {
  name: KuroToolName;
  description: string;
  risk: ToolRisk;
  approval: ToolApproval;
  validate(input: unknown): input is TInput;
  execute(input: TInput, context: KuroToolContext): Promise<TOutput>;
}

export interface KuroToolContext {
  projectId: string;
  isReadOnly: boolean;
  emit(event: KuroToolEvent): void;
}

export interface KuroToolEvent {
  type: "tool.started" | "tool.completed" | "tool.failed" | "tool.approval-required";
  tool: KuroToolName;
  message: string;
  timestamp: string;
}

export interface KuroToolCall {
  id: string;
  tool: KuroToolName;
  input: unknown;
  status: "proposed" | "awaiting-approval" | "running" | "completed" | "failed" | "rejected";
}

type RegisteredKuroTool = {
  name: KuroToolName;
  description: string;
  risk: ToolRisk;
  approval: ToolApproval;
  validate(input: unknown): boolean;
  execute(input: unknown, context: KuroToolContext): Promise<unknown>;
};

export class KuroToolRegistry {
  // Store runtime-validated tools behind an erased generic boundary.
  private readonly tools = new Map<KuroToolName, RegisteredKuroTool>();

  register<TInput, TOutput>(definition: KuroToolDefinition<TInput, TOutput>): void {
    if (this.tools.has(definition.name)) throw new Error("Tool already registered: " + definition.name);
    this.tools.set(definition.name, definition as unknown as RegisteredKuroTool);
  }

  list(): Array<Pick<KuroToolDefinition, "name" | "description" | "risk" | "approval">> {
    return [...this.tools.values()].map(({ name, description, risk, approval }) => ({ name, description, risk, approval }));
  }

  async run<TOutput>(
    call: KuroToolCall,
    context: KuroToolContext,
    options: { approved?: boolean } = {},
  ): Promise<TOutput> {
    const tool = this.tools.get(call.tool);
    if (!tool) throw new Error("Unknown Kuro tool: " + call.tool);
    if (context.isReadOnly) throw new Error("The current context is read-only; no drawing or project changes are allowed.");
    if (!tool.validate(call.input)) throw new Error("Invalid input for Kuro tool: " + call.tool);
    if (tool.approval === "required" && options.approved !== true) {
      context.emit({ type: "tool.approval-required", tool: call.tool, message: "Approval is required before this action can run.", timestamp: new Date().toISOString() });
      throw new KuroApprovalRequiredError(call.tool);
    }
    context.emit({ type: "tool.started", tool: call.tool, message: "Started " + call.tool, timestamp: new Date().toISOString() });
    try {
      const result = await tool.execute(call.input, context) as TOutput;
      context.emit({ type: "tool.completed", tool: call.tool, message: "Completed " + call.tool, timestamp: new Date().toISOString() });
      return result;
    } catch (error) {
      context.emit({ type: "tool.failed", tool: call.tool, message: error instanceof Error ? error.message : "Tool execution failed.", timestamp: new Date().toISOString() });
      throw error;
    }
  }
}

export class KuroApprovalRequiredError extends Error {
  readonly tool: KuroToolName;
  constructor(tool: KuroToolName) {
    super("User approval required for " + tool);
    this.name = "KuroApprovalRequiredError";
    this.tool = tool;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(value: unknown, key: string, maxLength = 240): boolean {
  return isRecord(value) && typeof value[key] === "string" && value[key].trim().length > 0 && value[key].length <= maxLength;
}

export function createKuroToolCall(tool: KuroToolName, input: unknown): KuroToolCall {
  return { id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "tool-" + Date.now().toString(36), tool, input, status: "proposed" };
}
