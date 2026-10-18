# Kuro Canvas — Complete Product Specification

**Purpose:** Durable, tool-independent source of truth for the intended product. Read this before implementing features. This describes the target, not a claim that all features exist.

## 0. Product promise

Kuro Canvas is a local-first, chat-first creative studio and persistent creative partner for manga, manhua, and Webtoon production. The user can discuss a fictional universe, establish canon, plan stories, and watch Kuro construct editable artwork panel by panel through the native drawing engine.

**Non-negotiable:** the model plans and chooses tools; deterministic, typed native tools create and edit the actual artwork. Image generation must never silently replace the visible, editable drawing process. Unimplemented features must be described honestly.

## 1. Experience principles

- Chat is the primary control surface. Users should ask naturally.
- Kuro should be warm, context-aware, creative, and honest. She must not claim to remember, research, save, draw, approve, export, or test something unless the app confirms it.
- Show the task, plan, queue, current panel, action statuses, warnings, errors, and pending approvals.
- Users can pause, resume, cancel, inspect, revise, approve, reject, and undo AI work.
- Destructive actions and canon retcons require confirmation and recovery.
- No fake sample chats, pretend live previews, simulated success indicators, or fabricated continuity claims.
- Accessibility: keyboard navigation, focus states, screen-reader labels, scalable UI, contrast, reduced motion, and touch-friendly controls.

## 2. Series foundation and writing workflow

Kuro helps establish an editable series bible: premise, genre, tone, themes, audience, narrative promises, content boundaries, world rules, geography, cultures, factions, institutions, history, character cast, relationships, motivations, secrets, conflicts, character arcs, dialogue voices, long-term plot, saga/season/chapter arcs, reveals, clues, foreshadowing and intended payoffs. Maintain a visual bible covering art direction, rendering, palette, lighting, line weight, anatomy conventions, costumes, typography, panel language, and reading direction.

The intended workflow is chapter brief -> outline -> scenes -> beats -> panel plan -> dialogue/lettering -> thumbnails -> refined artwork -> continuity review -> export. Generated items start as proposals; the user decides what becomes canon. Support alternate drafts and branching versions without silently overwriting approved material.

## 3. Universe memory and canon intelligence

Build a durable, searchable, project-scoped knowledge system—not a giant transcript pasted into every prompt.

### Scale and entity types
Design for a target roster of up to 500 characters and large worlds. Entity types include series, arc, chapter, scene, panel, character, relationship, faction, location, object, outfit, rule/ability, event, clue, secret, visual reference, template, asset, and research source. Use stable IDs and links.

### Character records
Support names/aliases, age and age-at-event, appearance, height/build, hairstyle, scars/marks, clothing and outfit history, voice/speech patterns, personality, preferences, goals, relationships, affiliations, skills, possessions, current and past locations, story-relevant injuries/deaths, knowledge/beliefs, secrets, and dated changes. Resolve natural-language references such as “the character with the scar” to candidates; ask when ambiguous rather than guessing.

### Canon and temporal truth
- Status: approved, proposed, inferred, contradicted, superseded; retain provenance and revision history.
- Unknown is distinct from false. Missing information is not a negative fact.
- Separate world truth from what each character knows, believes, suspects, or has been told.
- Track story-time intervals and event order, including injuries, deaths, travel, costume/relationship/location changes, and possessions.
- Track secrets, clues, foreshadowing, intended reveals/payoffs, and who may know what at each point.
- Link facts to user statements, source notes, chapters, scenes, panels, or events. Inferences carry rationale/confidence but never auto-promote to canon.
- Contradictions trigger explanation and options. Retcons require approval and show downstream chapters, panels, assets, and templates affected.
- Retrieve only relevant records for a task; provide inspect, search, edit, pin, compare, and history controls.
- Memory survives app restarts and project transfer and is scoped to the correct project. Never leak one universe into another.

## 4. Native drawing and visible execution

Maintain editable document geometry, strokes, layers, text, shapes, panels, assets, and operation history. Separate canvas rendering from model reasoning. Support pressure/coalesced pointer input where available, touch, mouse, stylus, zoom, pan, and consistent viewport-to-document transforms.

### Safe typed command families
Versioned schemas for bounded strokes/points, paths, lines, ellipses, rectangles, shapes, text objects, layer create/rename/reorder/visibility/lock/opacity/blend, panel/document operations, asset placement, groups, checkpoints, and exports. Each command names target project/document/panel/layer and has a stable action ID. Reject unknown fields and unsupported commands.

### Execution pipeline
1. User request and relevant canon retrieval.
2. Structured plan with dependencies, expected result, scope, and risks.
3. Schema validation and policy checks.
4. Preview/approval based on risk and user settings.
5. Incrementally execute native actions on the real canvas.
6. Show each action in a timeline: pending/running/completed/failed/cancelled.
7. Record provenance, resulting object IDs, checkpoints, and errors.
8. Verify actual document state; never infer success from model text.
9. Offer undo, revise, retry a selected step, or continue.

### Safety and recovery
- No arbitrary model-generated JavaScript/eval, unrestricted filesystem access, or arbitrary network requests.
- Validate finite coordinates, dimensions, colors, pressure, point counts, layer IDs, lock/read-only state, operation count, duration, and memory limits.
- Cancellation stops queued actions and checks cancellation between bounded operations.
- Undo/redo and checkpoint rollback reverse real changes, including grouped and cross-layer edits.
- Destructive edits, overwrites, bulk operations, and canon retcons require explicit approval.
- Batch long work and yield to rendering/input. Errors preserve recoverable state and identify the failed action.

## 5. Panel-by-panel manga production

Support infinite/virtualized vertical Webtoon scroll and page-based layouts, chapters, scenes, panel groups, gutters, panel order, reading direction, and pacing. Start with rough stick-figure blocking and composition thumbnails on the actual canvas. Progress through gesture/pose, anatomy/volume, silhouettes, perspective, environments, props, linework, value/color, lighting, effects, and polish in reviewable stages.

Users can inspect/edit each panel at every stage, lock approved panels, compare versions, revise only a selected stage, and preserve accepted work. Reuse poses, characters, clothing, props, backgrounds, camera views, and templates with provenance/versioning. Check identity, proportions, scars, hairstyle, outfit continuity, screen direction, geography, injuries, and object positions against canon and neighboring panels. Support speech/thought bubbles, tails, narration, SFX, lettering styles, balloon order, text fit, and reading-direction validation. Panel-level revision must not damage unrelated panels.

## 6. Creative Vault and reusable assets

Provide a searchable, project-aware vault for character sheets, expressions, poses, outfits, props, locations, backgrounds, environment kits, scene templates, panel layouts, 3D setups, camera/light presets, palettes, brushes, and lettering styles. Each asset has stable ID, preview, editable source where available, tags, origin/provenance, version, approval state, license notes where relevant, and dependencies. Warn before changing assets used by multiple scenes; offer scoped update, fork, or historical preservation. Templates are composable/parameterized, not opaque flattened images. Let users inspect and combine references.

## 7. Optional 3D reference studio

A 3D workspace supplements, never replaces, native 2D drawing. Support reusable character/mannequin poses, camera focal length/angle, framing, perspective, lighting, environment layout, and props. Document import/export formats and licensing. Load assets on demand, dispose GPU resources, and keep 2D editing responsive. Trace a reference to its pose/camera/light settings. Do not promise automatic rigging of arbitrary characters without evidence.

## 8. Research, visual references and licensing

Prefer credible primary sources, museums, archives, scholarly publications, and reputable institutions. Store source title/URL, creator, publication/access date, license/usage rights if known, and supported design facts. Separate sourced facts from artistic interpretation and fictional invention. Offer roughly 4–5 distinct reference candidates when useful; users can inspect, reject, combine, or approve. Never imply commercial reuse is safe when license is unknown. Network research is optional and distinct from offline work.

## 9. Local-first storage and portable projects

Core drawing and existing local projects should not require an account or hosted backend. Store projects locally with autosave, recovery, schema migrations, integrity checks, and clear storage errors.

Target a versioned ZIP-compatible .kuro package containing a manifest, story/canon, chapters, panels, drawing documents/layers, artwork/assets, 3D references, vault assets, approvals, provenance, and revision/history metadata. Use streaming/chunked archive operations, indexes, and lazy loading; do not load every high-resolution asset into memory at once. Validate imports for size, schema, paths, MIME types, archive traversal, corruption, and untrusted payloads; never execute imported content. Provide import/export, duplicate/fork, backup/restore, migration, and graceful handling of unsupported future versions. JSON export is an interim interchange format, not a complete binary ZIP package. Explain browser storage quotas and backup responsibilities; do not promise unlimited storage or cross-device sync without an implemented sync mechanism.

## 10. Model/provider system and intelligence

Provider adapters expose tested capabilities, not assumed role labels. Support configured compatible hosted APIs and local endpoints where compatible; configure URL, model ID, optional key, and privacy settings. Validate remote HTTPS and restrict insecure HTTP to explicitly enabled loopback endpoints. Never place credentials in project packages, logs, or persistent browser storage by default. Explain that browser-side keys are exposed to client code while in use; a backend is only an option if actually implemented and secured.

Add cancellation, timeouts, streaming, rate-limit handling, actionable errors, and schema-validated structured output. Route to planning, writing, continuity, vision, research, coding, and fast-helper roles only when capability is established. The orchestrator builds plans; an allowlisted tool registry executes them. Model output is untrusted data. A small offline model is a separate future capability with honest device, size, quality, and memory constraints; never imply a 100 MB model can reliably do advanced reasoning without evidence.

## 11. Privacy, self-improvement and security

Local/project memory is private and project-scoped by default. Sharing/contributing memories or skills is off by default and requires informed opt-in and inspect/export/delete controls. Proposed skills require evaluation, provenance, versioning, and explicit approval before activation. Do not train on user content or transmit it to external providers without the configured provider path and clear user understanding. Never store API secrets in localStorage, project files, telemetry, or logs. Treat prompts, model responses, imported projects, references, and external web content as untrusted. Enforce boundaries in the tool layer, not just the system prompt. Do not promise zero hallucinations; mitigate them with provenance, validation, retrieval, contradiction detection, and human approval.

## 12. Device support and accessibility

Target desktop, laptop, tablet, iPad-class devices, mobile phones, and stylus workflows. Adapt layout to screen size/input method while preserving access to chat, canvas, layers, project/vault, panel timeline, undo/redo, and approvals. Optimize memory pressure and small devices. Device claims require tests on representative hardware and browsers.

## 13. Export and publishing

Export editable projects/packages, PNG/JPEG/WebP, PDF, CBZ where appropriate, and long Webtoon strips split into configurable segments. Preserve color, alpha, panel order, lettering, visibility, and compositing. Validate dimensions, file sizes, fonts, and target-platform requirements; maintain a compatibility matrix from current official platform docs. Do not claim direct publishing/API integration until permissions and the full flow are verified. Manual export remains available.

## 14. Official visual identity

Use the exact official Kuro Canvas icon supplied by the user. Do not replace it with an AI-generated substitute. If the original asset is not in the repository/workspace, mark it as a missing dependency and request the exact asset rather than inventing a replacement.

## 15. Testing and definition of done

Implemented means code exists. Verified means evidence supports acceptance criteria. Every meaningful feature needs unit tests for schemas/validation/migrations; integration tests for persistence/provider/action execution/errors; regressions for undo/redo, layer isolation, hidden/locked layers, order/opacity/blend, document switching, autosave/recovery, import/export; end-to-end workflow including cancellation and recovery; responsive/accessibility and representative device checks; security/privacy review; successful CI links. No test claims without evidence. Update the roadmap in the same PR and after merge.

## 16. Ordered delivery milestones

1. Stabilize current main: CI/build, regression tests, real provider behavior, settings/security, canvas-layer correctness.
2. Finish provider integration: cancellation, timeouts, streaming where supported, strict schemas, errors, tests.
3. Native action engine: typed drawing commands execute on actual canvas with real undo/redo, approvals, cancellation.
4. Live action timeline: transparent per-action status, pause/resume/cancel, checkpoints, retry/revise, execution verification.
5. AI plan integration: model -> structured plan -> validated orchestrator -> approval -> native registry; no arbitrary code execution.
6. Universe memory MVP: series bible, character/entity records, provenance, temporal facts, retrieval/UI; then scale toward 500 characters.
7. Outline-to-thumbnail: chapter outline, scenes, panel plans, real stick-figure thumbnails, panel-by-panel refinement.
8. Comic production tools: panel layouts, infinite scroll/page mode, bubbles, lettering, reading direction, continuity checks.
9. Vault and reusable assets: versioned characters, outfits, props, environments, templates, dependency impacts.
10. 3D reference studio and research: lazy-loaded 3D, trusted-source research, provenance/license tracking.
11. Portable .kuro package: complete ZIP-compatible bundle with artwork/assets/history, streaming import/export and migrations.
12. Publishing and polish: export formats/presets, device/accessibility/performance testing, validated integrations, release checklist.

## 17. Mandatory handoff for any coding tool

1. Read this spec and README.md, ROADMAP.md, ARCHITECTURE.md, docs/DECISIONS.md, docs/CANON-MEMORY.md, docs/DRAWING-ACTIONS.md, docs/RELEASE-CHECKLIST.md.
2. Inspect current main, relevant PRs, recent CI results, and source. Do not assume prior chat summaries are current.
3. Start with the earliest incomplete milestone and dependencies.
4. Make a small, coherent, testable change; preserve working features and avoid fake UI.
5. Update ROADMAP.md in the same PR with status, PR link, tests, evidence, and remaining gaps.
6. Update this spec/subsystem docs when contracts change; record durable product decisions in docs/DECISIONS.md.
7. Do not merge failing/unverified PRs merely to keep moving. Inspect logs, fix causes, and rerun.
8. After merge, verify merge and CI on the merged commit; update status before dependent work.

This document is the product target and acceptance contract, not a claim that every listed feature already exists.
