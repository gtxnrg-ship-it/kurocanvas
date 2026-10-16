# Kuro Canvas Native Drawing Actions

## Goal
Let Kuro create and revise artwork by calling deterministic, typed drawing operations on the actual canvas. Do not substitute an image-generation result for these operations.

## Command design
Use a versioned schema. Candidate command families:
- Stroke: begin stroke, append bounded points, end stroke
- Geometry: path, line, ellipse, rectangle and other supported primitives
- Text: add/edit text objects with validated style and bounds
- Layers: create, rename, reorder, set visibility/lock/opacity/blend mode
- Document: set canvas bounds or select a target panel where supported
- Grouping: named action groups/checkpoints for one coherent task

Define exact schemas in code before exposing a command to a model. Unknown command names and fields must be rejected.

## Safety validation
- Validate finite coordinates, dimensions, colors, pressure and point counts.
- Enforce per-command and per-plan operation limits.
- Require valid project/document/layer IDs.
- Reject operations targeting locked layers or read-only documents.
- Apply viewport-to-document coordinate transforms consistently.
- Do not accept arbitrary code, scripts, URLs or filesystem paths as executable commands.
- Require stronger approval for destructive operations, bulk deletion, overwrites and project replacement.

## Execution lifecycle
States: `planned`, `awaiting_approval`, `running`, `completed`, `failed`, `cancelled`.
Each action records an ID, task/plan ID, command type, parameters (excluding secrets), target revision, status, timestamps, result/error and affected objects.

## User controls
- Preview the plan before execution where practical.
- Show a live timeline and current operation.
- Allow pause, resume and cancellation.
- Do not continue queued actions after cancellation.
- Allow individual action or action-group approval.
- Explain failures and offer safe retry/replan options.

## Undo and rollback
Group a coherent AI drawing step into an undoable transaction where feasible. Prefer inverse operations or a captured checkpoint/diff. Do not undo unrelated user work. If rollback cannot be guaranteed, disclose the limitation before execution and require appropriate approval.

## Rendering and performance
The model selects high-level commands; application code performs rendering. Batch compatible point/path updates, avoid recreating every layer surface on each render, and use bounded queues. Keep long-running operations responsive.

## Verification checklist
- Valid command changes the real canvas.
- Invalid or oversized command is rejected without partial corruption.
- Cancellation stops queued work.
- Undo restores the previous state and preserves unrelated user strokes.
- Locked/hidden layers behave correctly.
- Layer order, opacity, blend mode and PNG export agree.
- A failed multi-step action can recover to a known state.
- Action timeline state matches actual execution.
