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
- [ ] Verify current `main` and reconcile PR status before duplicating work.
- [ ] Inspect layer opacity/order/blending changes (PR #15); resolve conflicts and run checks before merge.
- [x] Verify fictional preview cleanup PR #17 — recorded merged.
- [x] Verify initial orchestrator PR #21 — recorded merged.
- [ ] Confirm current production build and add repeatable TypeScript/build/test gates.
- [ ] Add regression tests for drawing, layer isolation, document switching, autosave/recovery and export.
- [ ] Keep this roadmap aligned with actual code and CI.

## Phase 1 — Real model connection
- [x] Implement an OpenAI-compatible chat-completions adapter in `src/ai/openAICompatibleProvider.ts` (implemented; verify via CI and real endpoint tests).
- [x] Add provider URL security validation: HTTPS for remote endpoints and explicitly enabled HTTP only for localhost.
- [x] Add provider settings UI to test an endpoint, list models, and select a model.
- [x] Connect Chat to the configured model and display provider errors honestly (initial non-streaming integration; CI verification pending).
- [x] Keep API keys in application memory only; persist only the endpoint, selected model ID and localhost policy.
- [x] Explain browser-side credential exposure and that requests go to the configured provider.
- [ ] Add cancellation, timeouts, streaming and robust retry/rate-limit handling.
- [ ] Validate structured model output against strict schemas before using it for plans or tools.
- [ ] Add automated tests and verify against real hosted and local compatible endpoints.
- [ ] Connect model output to the orchestrator and safe native tools (chat does not yet execute drawing actions).

## Phase 2 — Native drawing-action engine
- [ ] Define versioned, typed drawing commands (strokes/points, paths, shapes, text, layer operations).
- [ ] Connect the tool registry to actual canvas functions.
- [ ] Validate coordinates, sizes, colors, document/layer IDs and operation limits.
- [ ] Prohibit arbitrary code execution and unrestricted filesystem/network access.
- [ ] Add preview, approval policies, execution statuses and action provenance.
- [ ] Add a visible timeline, pause/resume/cancel, checkpoints and reliable undo/rollback.
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
