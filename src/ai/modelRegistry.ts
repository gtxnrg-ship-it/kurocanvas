/** Kuro intelligence contracts. These describe model capabilities without bundling or downloading a model. */
export type ModelRole =
  | "reasoning"
  | "planning"
  | "tool-calling"
  | "coding"
  | "story-writing"
  | "continuity"
  | "vision"
  | "embeddings"
  | "research"
  | "fast-helper";

export type ModelLocation = "local" | "remote";
export type ModelCapability =
  | "chat"
  | "structured-output"
  | "tool-calling"
  | "vision"
  | "embeddings"
  | "streaming";

export interface ModelDescriptor {
  /** Stable app-owned ID, not a provider's mutable display name. */
  id: string;
  name: string;
  providerId: string;
  location: ModelLocation;
  roles: ModelRole[];
  capabilities: ModelCapability[];
  /** Optional download size in bytes, when known. */
  downloadBytes?: number;
  /** Optional approximate memory requirement in bytes, when known. */
  memoryBytes?: number;
  license?: string;
  modelUri?: string;
  installed: boolean;
  enabled: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface ModelRequest {
  role: ModelRole;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
}

export interface ModelResponse {
  text: string;
  modelId: string;
  providerId: string;
  finishReason: "stop" | "length" | "cancelled" | "error";
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelProvider {
  readonly id: string;
  readonly displayName: string;
  listModels(): Promise<ModelDescriptor[]>;
  isAvailable(): Promise<boolean>;
  generate(request: ModelRequest, model: ModelDescriptor): Promise<ModelResponse>;
}

export interface ModelSelectionContext {
  preferredModelId?: string;
  availableMemoryBytes?: number;
  require?: ModelCapability[];
  allowRemote: boolean;
}

export interface ModelSelection {
  model: ModelDescriptor;
  reason: string;
}

export function selectModel(
  models: readonly ModelDescriptor[],
  role: ModelRole,
  context: ModelSelectionContext,
): ModelSelection | undefined {
  const required = context.require ?? [];
  const candidates = models.filter(model =>
    model.enabled
    && model.installed
    && model.roles.includes(role)
    && (context.allowRemote || model.location === "local")
    && required.every(capability => model.capabilities.includes(capability))
    && (context.availableMemoryBytes === undefined
      || model.location !== "local"
      || model.memoryBytes === undefined
      || model.memoryBytes <= context.availableMemoryBytes),
  );

  if (context.preferredModelId) {
    const preferred = candidates.find(model => model.id === context.preferredModelId);
    if (preferred) return { model: preferred, reason: "Selected the user's preferred compatible model." };
  }

  // Prefer local execution when permitted, then a model with fewer unknown requirements.
  candidates.sort((a, b) => {
    const localBias = Number(b.location === "local") - Number(a.location === "local");
    if (localBias !== 0) return localBias;
    return Number(a.memoryBytes === undefined) - Number(b.memoryBytes === undefined);
  });
  const model = candidates[0];
  return model ? { model, reason: "Selected the first available model compatible with this task and device constraints." } : undefined;
}

export class ModelRegistry {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly models = new Map<string, ModelDescriptor>();

  registerProvider(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) throw new Error("Provider already registered: " + provider.id);
    this.providers.set(provider.id, provider);
  }

  registerModel(model: ModelDescriptor): void {
    if (!this.providers.has(model.providerId)) throw new Error("Unknown provider: " + model.providerId);
    if (this.models.has(model.id)) throw new Error("Model already registered: " + model.id);
    this.models.set(model.id, { ...model, roles: [...model.roles], capabilities: [...model.capabilities] });
  }

  listModels(): ModelDescriptor[] {
    return [...this.models.values()].map(model => ({ ...model, roles: [...model.roles], capabilities: [...model.capabilities] }));
  }

  getModel(id: string): ModelDescriptor | undefined {
    const model = this.models.get(id);
    return model ? { ...model, roles: [...model.roles], capabilities: [...model.capabilities] } : undefined;
  }

  getProvider(id: string): ModelProvider | undefined {
    return this.providers.get(id);
  }

  select(role: ModelRole, context: ModelSelectionContext): ModelSelection | undefined {
    return selectModel(this.listModels(), role, context);
  }

  setEnabled(id: string, enabled: boolean): void {
    const model = this.models.get(id);
    if (!model) throw new Error("Unknown model: " + id);
    this.models.set(id, { ...model, enabled });
  }
}
