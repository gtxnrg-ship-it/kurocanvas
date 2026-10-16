# Kuro Canvas Architecture

## Product boundary
Kuro Canvas is a local-first manga/manhua/Webtoon creation studio. AI proposes plans and selects safe native drawing operations; the drawing engine executes those operations. A generated image must not silently stand in for the native drawing workflow.

## Intended high-level flow

```text
User / Chat UI
    -> Task Router / Orchestrator
        -> Project-scoped Memory Retrieval
        -> Model Provider Adapter
        -> Validated Creative Plan
            -> Approval Policy
                -> Typed Tool Registry
                    -> Drawing / Project / Comic Tools
                        -> Drawing Engine + Project Data Engine
                            -> Local Persistence + Undo/Checkpoints
    -> Live Action Timeline / Results / User Feedback
```

## Main subsystems

### UI
Chat, canvas, chapter/panel workspace, Creative Vault, settings and action timeline. UI must reflect actual execution state; no fake success states or invented preview content.

### Provider adapter
A narrow interface for configured model providers. Handle timeouts, cancellation, streaming and provider-specific capability differences. Never treat model text as executable code. Browser-side API credentials can be exposed to client code; make this limitation clear and use a secure backend when the provider requires it.

### Orchestrator
Routes a task to planning, writing, continuity or drawing workflows. Produces a structured plan with explicit dependencies and risks. The orchestrator itself does not imply that a model is connected or that actions have executed.

### Memory and canon
Project-scoped facts with provenance and explicit status: approved, proposed, inferred, contradicted or superseded. Unknown is distinct from false. Store character knowledge separately from world truth. Retrieve a relevant subset for each task instead of depending on one giant conversation prompt.

### Tool registry
Allowlisted, typed operations only. Validate input schemas and target document/layer IDs. Tools should declare their risk, approval requirements, effects and whether an inverse/rollback is supported. No arbitrary JavaScript evaluation.

### Drawing engine
Owns actual geometry, paths, strokes, layers, compositing and export. The model chooses high-level operations; deterministic application code applies them to the canvas. Agent operations must be attributable, cancellable and reversible where possible.

### Project/data engine
One coherent project model should link universe memory, series, chapters, scenes, panels, drawings, layers, assets, approvals and history. Current foundations include separate drawing/project storage; integration is a planned task.

### Persistence
Local-first IndexedDB and explicit import/export. Future `.kuro` packaging should be versioned, integrity-checked and capable of carrying binary assets without converting all data into large JSON strings.

### Optional 3D studio
Separate, lazily loaded reference workspace for poses, cameras, lighting and environments. It supports 2D creation rather than replacing it. Release GPU resources and provide a low-resource fallback.

## Execution state machine
Recommended states: `planned`, `awaiting_approval`, `running`, `completed`, `failed`, `cancelled`.
- Validate before running.
- Approval is explicit and bound to the specific plan/action being approved.
- Cancellation stops queued work and signals cancellable active work.
- Record results/errors and affected document revisions.
- Use checkpoints or inverse operations for rollback.
- Never report completion until the underlying operation has succeeded.

## Security and privacy
- Treat provider responses, imported packages, reference assets and user-provided files as untrusted.
- Validate and bound every tool input.
- Do not expose unrestricted filesystem, shell, network or arbitrary-code tools to the model.
- Never commit provider secrets or include them in logs/project packages.
- Keep memory project-scoped and local by default.
- Shared learning or cross-project memory requires explicit user authorization.

## Verification
A feature is Verified only after tests cover its behavior. At minimum, test provider failures/cancellation, action validation and rollback, autosave/recovery, layer isolation/compositing, project import/export, and the end-to-end outline-to-thumbnail workflow.
