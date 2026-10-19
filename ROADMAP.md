# Kuro Canvas Master Roadmap

Kuro Canvas is a local-first, chat-first manga/manhua/Webtoon creation studio. Its AI should plan and execute **real, inspectable native drawing operations**; generated images must not silently replace the drawing workflow.

## Status vocabulary
- **Planned** — not implemented.
- **In progress** — implementation has started.
- **Implemented** — code exists, but end-to-end verification may be incomplete.
- **Verified** — relevant tests or real workflows passed.
- **Blocked** — a dependency or issue prevents progress.

Do not mark a feature Verified based on UI presence or type definitions alone. Link a PR, test run, or reproducible manual test when changing status.

## Current recorded foundations
These items have appeared in the repository's PR history. Their integration and current-main status should still be checked where noted.
- Responsive React + TypeScript + Vite application shell.
- Basic 2D canvas drawing, brush/eraser, undo/redo and PNG export.
- Local autosave/recovery and multiple drawings using IndexedDB.
- Layer data model, layer controls and per-layer rendering/isolation.
- Local project/template storage and basic JSON project import/export.
- Model-role/provider contracts, privacy-aware memory primitives, local memory persistence, typed tool registry and initial AI orchestrator.
- Build workflow based on Node/npm; PR #18's recorded workflow runs passed for its commit.

## Immediate stabilization
- [x] Reconcile recent PR history: PR #17, #21, #25, #26, #27, #28, #29 and #30 are merged; PR #15 is closed unmerged and superseded by #27/#28.
- [x] Add persistent README handoff rules and master documentation (PR #29).
- [x] Add exhaustive product specification (this documentation PR; see docs/PRODUCT-SPEC.md).
- [x] Add provider-to-chat UI and model discovery (PR #30; GitHub Actions passed for PR head).
- [ ] Verify provider end-to-end against a real hosted and local endpoint; no real endpoint has been tested in this workflow.
- [x] Add initial Vitest regression tests for command validation, native executor behavior, queue transitions, and local drawing bridge (PRs #37–#38; CI must run them).\n- [ ] Expand regression tests for visible canvas integration, layer isolation, document switching, autosave/recovery and export.
- [ ] Verify current main production build after all merged changes; keep roadmap aligned with CI.

## Phase 1 — Real model connection
- [x] Implement an OpenAI-compatible chat-completions adapter in `src/ai/openAICompatibleProvider.ts` (implemented; verify via CI and real endpoint tests).
- [x] Add provider URL security validation: HTTPS for remote endpoints and explicitly enabled HTTP only for localhost.
- [x] Add provider settings UI to test an endpoint, list models, and select a model.
- [x] Connect Chat to the configured model and display provider errors honestly (PR #30 merged; PR-head CI passed; real endpoint testing still pending).
- [x] Keep API keys in application memory only; persist only the endpoint, selected model ID and localhost policy.
- [x] Explain browser-side credential exposure and that requests go to the configured provider.
- [ ] Add cancellation, timeouts, streaming and robust retry/rate-limit handling.
- [ ] Validate structured model output against strict schemas before using it for plans or tools.
- [ ] Add automated tests and verify against real hosted and local compatible endpoints.
- [x] Connect the first bounded model-to-canvas drawing path with explicit approval (PRs #41–#42; stroke additions only; real-provider/browser verification still pending).

## Phase 2 — Native drawing-action engine
- [x] Define a first versioned, strictly validated native command schema for stroke addition and basic layer visibility/opacity/lock changes in src/drawing/commands.ts (schema foundation only; not yet wired to the canvas).
- [ ] Connect the typed tool registry and drawing-action queue to the visible canvas lifecycle (the first approved stroke-only path is wired separately; queue/timeline integration remains).
- [ ] Validate coordinates, sizes, colors, document/layer IDs and operation limits.
- [ ] Prohibit arbitrary code execution and unrestricted filesystem/network access.
- [x] Add a basic approval card for validated stroke-only plans (PR #41); [ ] add a rendered preview, queue-backed statuses and action provenance.
- [ ] Add a visible action timeline, pause/resume/cancel, checkpoints and grouped undo/rollback (current canvas undo remains stroke-by-stroke).
- [ ] Ensure cancelled work cannot continue executing queued actions.

## Phase 3 — Persistent universe memory
- [ ] Project-scoped universe bible, world rules, factions, locations, characters and relationships.
- [ ] Events, timelines, injuries, deaths, possessions, travel and other stateful continuity.
- [ ] Separate approved canon from proposed, inferred, contradicted and superseded information.
- [ ] Represent unknown distinctly from false; never silently promote inference into canon.
- [ ] Track what each character knows versus what is true in the world.
- [ ] Track clues, secrets, foreshadowing and intended payoffs.
- [ ] Attach provenance to source notes, chapters, scenes, panels or events.
- [ ] Retrieve only relevant memory for a task; provide inspect/edit/search tools.
- [ ] Require approval for retcons and show their downstream impact.
- [ ] Add export, import, recovery and project-scoped privacy controls.

## Phase 4 — Chapter-to-panel workflow
- [ ] Discuss and approve a structured series bible.
- [ ] Create chapter briefs, outline, scene breakdown and panel-by-panel plans.
- [ ] Include composition, camera, poses, expressions, dialogue, mood and pacing.
- [ ] Generate rough stick-figure thumbnails through native drawing operations.
- [ ] Show each panel being drawn in real time.
- [ ] Progressively refine roughs into shapes, anatomy, backgrounds, linework, shadows and details.
- [ ] Allow panel-level revisions without restarting unrelated work.
- [ ] Add lettering, continuity checks and approval gates for outline, thumbnails, finished panels and chapter.
- [ ] Resume interrupted plans and trace revisions.

## Phase 5 — Drawing engine quality
- [ ] Real viewport pan/zoom, pressure-sensitive input and stylus testing.
- [ ] Correct layer order, opacity, blend modes and export compositing.
- [ ] Layer groups, clipping masks, alpha lock, selection, transforms, lasso, shapes and configurable brushes.
- [ ] Reference-image layers, canvas resize/crop and operation recovery.
- [ ] Performance and regression tests on large canvases and lower-powered devices.

## Phase 6 — Comics and Webtoon production
- [ ] Shared comic document model: series, chapters, scenes, panels, artwork and lettering.
- [ ] Panel layout, borders, gutters, margins and reading direction.
- [ ] Infinite/virtualized vertical strip and long-chapter navigation.
- [ ] Speech bubbles, tails, narration, sound effects and typography controls.
- [ ] Panel-level revisions and chapter-level continuity checks.
- [ ] Export PNG/JPEG/WebP, PDF, CBZ and split long-strip presets.
- [ ] Validate output dimensions, order and target-platform constraints.

## Phase 7 — Creative Vault
- [ ] Searchable, versioned assets for characters, locations, props, costumes, backgrounds, references and panels.
- [ ] Character sheets, expressions, outfit variants and visual history.
- [ ] Reusable environments, panel layouts and production templates.
- [ ] Provenance, approval status, tags, duplicate detection and dependency tracking.
- [ ] Warn when a changed asset affects existing or planned panels.

## Phase 8 — On-demand 3D reference studio
- [ ] Poseable mannequins, camera/perspective controls and lighting.
- [ ] Reusable environments, props and saved reference scenes.
- [ ] Import validation and capture/export of 3D references into the 2D workflow.
- [ ] Lazy-load assets, dispose GPU resources and provide a low-resource fallback.

## Phase 9 — Research and references
- [ ] Research workflow prioritizing museums, archives, scholarly and authoritative sources.
- [ ] Present multiple candidate references when available.
- [ ] Record source URLs, attribution, licenses and usage restrictions.
- [ ] Let the user compare, combine, reject and approve references.
- [ ] Link approved references to designs and separate facts from creative interpretation.
- [ ] Cache approved references for offline access.

## Phase 10 — Optional voice and atmosphere
- [ ] Configurable character voice profiles and supported speech synthesis.
- [ ] Speaker attribution, bubble reading, synchronized narration and optional auto-scroll.
- [ ] Optional scene music/ambience with mute/accessibility controls.
- [ ] Permission and licensing safeguards; do not claim reliable bubble detection until tested.

## Phase 11 — Complete `.kuro` package
- [ ] Specify a versioned ZIP-compatible package format.
- [ ] Include project metadata, universe/canon, plans, artwork, assets, 3D references, history and approvals.
- [ ] Store binary assets as files, not giant JSON strings.
- [ ] Manifest, hashes, integrity validation and schema migrations.
- [ ] Stream large packages and load assets lazily.
- [ ] Import preview, backup/restore, autosave and portability tests.

## Phase 12 — Local-first platform architecture
- [ ] Unify drawing, project, chapter, asset and memory storage behind a central project/data engine.
- [ ] Connect drawings to projects (current foundations may store them separately).
- [ ] Platform abstraction for storage, filesystem, networking and device features.
- [ ] Offline core drawing; online AI remains optional.
- [ ] Browser/desktop/Android/tablet responsive support and actual device testing.
- [ ] Optional local models with realistic device/resource compatibility reporting.
- [ ] Storage usage, cleanup, backup and recovery.

## Phase 13 — Model intelligence
- [ ] Capability-aware model selection for planning, story writing, tool use, coding, continuity, vision, embeddings and research.
- [ ] Manual overrides, fallbacks, cancellation, unloading and switching.
- [ ] Optional trusted-source model downloads with integrity checks and resource estimates.
- [ ] Benchmarking and task-quality evaluations.
- [ ] Keep private project content out of shared model memory unless explicitly authorized.

## Phase 14 — UX and identity
- [ ] Chat-first creative workspace, clear action timeline and honest progress/error states.
- [ ] Keyboard, touch, stylus and accessibility improvements.
- [ ] Consistent visual system and useful workspace customization.
- [ ] Use the user's official Kuro Canvas icon when the original asset is available; do not replace it with a generated substitute.
- [ ] Honest empty states and onboarding for project creation/model setup.

## Phase 15 — Security and quality
- [ ] Treat model output, imported projects and assets as untrusted input.
- [ ] Validate every action and limit permissions.
- [ ] Keep secrets out of source, project exports and logs.
- [ ] Test interruption, rollback, corruption recovery, package migrations and provider failures.
- [ ] End-to-end tests for the full creative journey.
- [ ] Verify supported target builds and maintain a known-issues list.

## First end-to-end milestone
A user can create a series, approve canon, ask for a chapter outline, review panel plans, watch native stick-figure thumbnails and progressively refined artwork appear, interrupt/revise/undo actions, then close and reopen the project with canon, plans, artwork and progress intact.

## Change log
- Keep updates small and linked to the PR/commit that implements them.
- Mark an item Verified only with a CI result or reproducible test evidence.


## Recent implementation log
- 2026-10-18 — README product vision and persistent handoff rules merged in [PR #29](https://github.com/gtxnrg-ship-it/my-app/pull/29). Future contributors must read the repository documents and update this roadmap with each implementation PR.
- 2026-10-18 — Initial real provider-to-chat integration prepared in branch `feat/connect-real-model-to-chat`: provider settings, endpoint/model discovery, in-memory-only API key handling, and non-streaming chat generation. Await CI and endpoint verification before marking Verified.
- 2026-10-18 — [PR #26](https://github.com/gtxnrg-ship-it/my-app/pull/26) merged; its GitHub Actions runs completed successfully for both Kuro Canvas checks and Project checks.


## Documentation and handoff
- [x] README defines Kuro's vision and instructs future agents to inspect source, PRs and CI.
- [x] docs/PRODUCT-SPEC.md captures the full target product and acceptance contract.
- [ ] Reconcile the product spec against any additional past-chat requirements that are not recoverable from repository artifacts.
- [ ] Update this roadmap in every feature PR and distinguish Implemented from Verified.

## Current state snapshot (2026-10-18)
- **Implemented:** responsive React/TypeScript shell; native basic 2D canvas; brush/eraser; undo/redo; IndexedDB drawing autosave and multiple documents; layer controls/order/opacity/blending; local project/template foundation; JSON package import/export; model registry/provider contracts; memory/evolution primitives; local memory storage; typed tool registry; initial orchestrator; OpenAI-compatible provider settings and text chat connection.
- **Not yet verified end-to-end:** provider connection against actual hosted/local services; security and CORS behavior across providers; complete project round-trip and high-resolution asset portability; device/stylus performance.
- **Not implemented end-to-end:** model-produced structured plan execution, native AI drawing tools, live action timeline, full canon/series-bible UI and retrieval, chapter-to-panel generation, stick-figure drawing workflow, full comic lettering/layout, 3D studio, complete ZIP-based .kuro archive, research/licensing workflow, publishing integrations.
- **Important:** current .kuro project support is JSON-oriented; do not describe it as the finished ZIP-compatible package.

## Next work sequence (do not skip dependencies)
1. Stabilize main and add automated regression tests around the existing canvas/layers/persistence/export.
2. Harden provider calls with AbortSignal cancellation, timeout/error handling, and streaming only where supported; add strict response schemas and tests.
3. Implement a versioned native drawing command schema and deterministic executor wired to the actual canvas document.
4. Add action queue/timeline with approvals, pause/cancel, checkpoints, provenance, and real undo/rollback.
5. Connect model output to the orchestrator and executor using strict validation; keep untrusted model output from calling arbitrary code.
6. Build the persistent series bible/canon UI and retrieval with temporal facts, provenance, status, character knowledge, and retcon impact.
7. Implement outline -> scene -> panel plan -> native stick-figure thumbnails -> progressive panel refinement.
8. Build comic/page/Webtoon layout, lettering, reusable vault, 3D references, research, full project package, and publishing/export hardening in the order defined in docs/PRODUCT-SPEC.md.


## 2026-10-18 progress update
- [x] PR #30 merged: configured OpenAI-compatible model provider and non-streaming chat connection. PR-head GitHub Actions passed; real hosted/local endpoint testing remains pending.
- [x] PR #31 merged: exhaustive product specification added at docs/PRODUCT-SPEC.md and linked from README; roadmap reconciled with actual PR status.
- [x] Initial native drawing command schema added on the current feature branch: strict JSON-safe types and bounds validation for stroke and layer commands. This is not yet an executor and does not modify canvas artwork.
- [ ] Add tests for command validation and rejection cases.
- [ ] Wire validated commands to the actual drawing canvas using deterministic execution, checkpoints, undo, and visible statuses.


## 2026-10-19 continuation
- [x] PR #32 merged: versioned native drawing command schemas with strict validation; both GitHub Actions checks passed.
- [x] Add a pure deterministic native drawing state reducer in `src/drawing/nativeExecutor.ts` for validated stroke add/remove and layer visibility/opacity/lock commands, with inverse operations for undo.
- [x] Add automated unit tests for command validation, executor immutability/failure atomicity, queue transitions, and the local drawing bridge (PRs #37–#38).
- [ ] Connect this reducer to DrawingCanvas and persist actual resulting state; add visible action queue, approval, cancellation, and checkpoints.
- [ ] Verify provider against a real endpoint and implement cancellation/timeouts before claiming production readiness.


## CI correction follow-up (2026-10-19)
- [x] Investigated failed PR #33 build: the schema extension had literal escaped newline sequences inserted into TypeScript source.
- [x] Corrected the schema line breaks on this branch; wait for fresh CI before merge.


## 2026-10-19 continuation — executor and action queue
- [x] PR #33 merged: deterministic native drawing executor is now on main; it remains a reducer primitive, not yet connected to the visible canvas.
- [ ] Add automated tests for command validation, reducer inverses, atomic plan failure, and queue transitions.
- [ ] Connect executor state to DrawingCanvas rendering and persistence without breaking pointer drawing, layer order, or autosave.
- [ ] Add visible queue controls with explicit approval, real progress, cancellation that prevents later queued work, and rollback/checkpoints.
- [ ] Connect validated model plans to this queue and executor; never mark actions complete unless execution succeeds.
- [ ] Cross-platform performance strategy documents the current TypeScript/React approach, measured optimization plan, and conditional Rust/WASM evaluation; device performance remains unverified.


## 2026-10-19 — automated drawing regression tests
- [x] Vitest regression suite added for strict command validation, native reducer immutability/failure atomicity, approval queue transitions, and the local drawing bridge (PRs #37–#38; CI passed on their PR heads).\n- [x] Add `npm test` to the Kuro Canvas pull-request CI workflow so tests run alongside the production build (this PR; pending its own CI).
- [x] Extend executor undo coverage to preserve removed stroke identity and original stack position with a dedicated restore command (this PR; CI pending).


## 2026-10-19 — local drawing command bridge
- [x] Add an adapter that validates untrusted command arrays against a local drawing's dimensions and layer state, applies them immutably through the native executor, and returns a new local-document snapshot plus inverse operations.
- [ ] Wire this adapter into DrawingCanvas with real action queue UI, persistence-before-success, cancellation, and undo integration.
- [ ] Run the new adapter regression tests in CI; adapter existence alone is not end-to-end AI drawing.


## 2026-10-19 — reversible stroke removal
- [x] Add `stroke.restore` as a bounded, validated inverse command that preserves the removed stroke's original ID, full point data, and stack position.
- [x] Add regression tests for remove/restore round trips and duplicate-ID rejection.
- [ ] Connect the executor and reversible history to the visible DrawingCanvas; reducer-level undo tests do not establish UI-level undo integration.


## 2026-10-19 — first approved chat-to-canvas loop
- [x] Add a model planning path for basic native stroke sketches, returning structured JSON rather than treating free-form prose as executable commands.
- [x] Show the proposed drawing summary and command count; require explicit approval before switching to the canvas and applying.
- [x] Validate the untrusted plan against current document bounds and layer/lock state, apply immutably, persist before reporting success, and report failures without claiming success.
- [ ] Verify CI and manually test against a real configured model provider and real browser canvas. This first loop supports native strokes only; it is not full AI studio/tool coverage or visual-quality assurance.


## 2026-10-19 — strict AI proposal parsing
- [x] Move model JSON parsing into a pure, tested boundary that rejects malformed payloads, unsupported command types, out-of-bounds points, unknown layers, oversized plans, and excessive points per stroke before the user sees an approval card.
- [ ] Continue expanding the native tool vocabulary and add integration tests for the visible approval-to-persistence flow.


- 2026-10-19 — PRs [#40](https://github.com/gtxnrg-ship-it/my-app/pull/40), [#41](https://github.com/gtxnrg-ship-it/my-app/pull/41), and [#42](https://github.com/gtxnrg-ship-it/my-app/pull/42) merged. Stroke restoration preserves identity/order; the first approval-gated model-to-canvas stroke workflow is connected; strict AI stroke-plan parsing rejects malformed, oversized, unsupported, and out-of-bounds output. PR-head CI passed for #41 and #42. Real provider/browser verification remains outstanding.
- 2026-10-19 — Corrected workspace status labels so the UI describes AI drawing as limited to approved native-stroke plans rather than saying no AI drawing tools are connected. This is a copy/status correction, not an expansion of drawing capability.
