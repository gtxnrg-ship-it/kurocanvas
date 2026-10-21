# Kuro Is an Art Agent — Native Tool Execution Contract

Status: product architecture correction, 2026-10-21.

## Identity

Kuro is an art agent operating the actual KuroCanvas drawing application. She is not an image-generation chatbot, and an image generator must never substitute for the core drawing workflow. She creates through the same native drawing instruments available to the human user.

Her primary output is an editable project state: real strokes, shapes, fills, selections, layers, masks, transforms, text/lettering objects, and other supported native objects. A flattened image may be used as an imported reference if the user asks, but it is not an acceptable substitute for the drawing she was asked to make.

## Execution model

1. **Understand** the user's intent, reference images, current canvas, style guide, and universe canon. Ask targeted questions when a missing decision materially changes the result.
2. **Inspect** the active document and tools available in the current build. Never claim to use a tool that does not exist.
3. **Plan** a drawing as a sequence of small, typed native actions. Example phases: composition guides, rough construction, refined sketch, line art, base colors, shadows, highlights, effects, lettering, cleanup. Adapt phases to the request; don't force a rigid style on every drawing.
4. **Preview and execute** using the exact same underlying commands as manual drawing, in named layers/groups where supported. The agent must call the application's tool/action layer, not simulate mouse movements as the only interface and not invent an alternate canvas.
5. **Checkpoint** the actual document before a batch. Each action has a schema, scope, parameters, provenance, and expected effects. Validate coordinates, sizes, colors, layer references, object bounds, and resource limits before applying.
6. **Inspect results** by reading back the real document state and rendering a preview from that state. Detect malformed strokes, off-canvas marks, unexpected empty layers, excessive overlap, and other measurable failures. Use visual review where available; disclose limits.
7. **Iterate** through native tools, preserving editable objects. Ask for approval at meaningful checkpoints and support pause/cancel/revise.
8. **Undo and rollback** by restoring the actual prior document/revision, not by asking a model to redraw something similar.
9. **Save and record provenance**: user brief, plan, action list, tool versions, input references, document revision, approvals, and changes. Show the resulting preview in chat and save the editable source to the current universe's Vault.

## Tool/action contract

Build one typed native action registry shared by manual UI tools and Kuro. Each action declares:
- stable action ID and schema version;
- supported document types and tool capability;
- validated parameters and coordinate units;
- universe, project, document, and revision scope;
- resource/time budgets and cancellation behavior;
- reversible operation or explicit checkpoint requirement;
- result data and provenance;
- capability tests and deterministic validation.

Kuro's planning model proposes actions; a deterministic executor validates and applies them. Model-authored prose is never treated as proof that an action ran. The executor returns structured success/failure and the exact resulting revision. Unsupported actions fail clearly.

Initial native action families should cover only tools that actually exist: stroke/path creation; brush/pencil/eraser settings; layer/group create/select/reorder/visibility/opacity; selection and transforms; fill/shape operations; text/lettering where implemented; document inspection; snapshot/restore; save/export. Extend this list only as capabilities are implemented and tested.

## Agent roles

- Creative director: translates the user's vision into a clear brief and style constraints.
- Drawing planner: decomposes the result into composition, shapes, forms, linework, tone, color, and detail.
- Tool executor: maps the plan to validated native operations.
- Continuity director: retrieves only current-universe approved character/environment references and catches design drift.
- Visual QA: inspects actual canvas results, checks objective rules, and asks for revision where needed.
- Conversation companion: explains choices naturally, handles long sessions, and takes corrections without losing the user's intention.

These are task roles/workflows, not a requirement to train separate giant models. All operate on the same selected universe and real document state.

## Non-negotiable restrictions

- No text-to-image output as a substitute for native drawing.
- No flattened image pretending to be editable layers.
- No fake progress or fabricated claims of tool execution.
- No cross-universe references without explicit copy/import.
- No destructive batch without a checkpoint and rollback path.
- No action outside the currently authorized document/project scope.
- No claims that visual quality is perfect; describe checks and known limitations honestly.

## Acceptance tests

- A requested simple character sketch produces native strokes/objects and layers, not a single imported bitmap.
- A user can select, edit, recolor, hide, and delete the created objects using ordinary canvas tools.
- Kuro's created strokes use the same brush settings and coordinate semantics as manual strokes.
- Interrupting a drawing batch leaves the document recoverable and doesn't leak partial work into another universe.
- Undo restores the exact prior document state and revision.
- The chat preview is rendered from the current editable document state.
- If the required drawing tool is missing, Kuro reports that limitation instead of pretending.
- Reopening the project preserves the native artwork, layer organization, provenance, and Vault reference.
