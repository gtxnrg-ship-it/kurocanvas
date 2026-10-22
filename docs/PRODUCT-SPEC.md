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

## 5. Format-aware creative production

Kuro is not a manga-only tool. The creator chooses the medium and format, or describes a custom form; Kuro adapts planning, layout, pacing, reading direction, canvas profile, lettering, and continuity checks to that brief. Supported target conventions include:

- **Webtoon / vertical-scroll comics:** long vertical strips, varied panel heights, phone-first pacing, intentional gutters, and scroll reveals.
- **Manga pages and doujin / fan-created comics:** paginated layouts, explicit reading direction, panel order, source-aware inspiration, and creator-defined canon. Never trace or reproduce a source's specific page, protected character design, or signature composition.
- **Short one-shots:** compact standalone stories with setup, turn, and resolution, without assuming a long serialized chapter arc.
- **Comic strips and graphic novels:** horizontal 3–4 panel strips, general comic pages, or cinematic page rhythms without forcing manga conventions.
- **Visual-novel scene boards, animation/film storyboards, and shot sequences:** staging, camera angle, action continuity, character placement, scene/background cues, and reserved dialogue areas. A storyboard is not a playable game, animation, or rendered film.
- **Illustrated picture books, character/concept sheets, and custom hybrid formats:** composition and text areas suited to the brief, with creator-controlled exceptions to defaults.

The project must keep the *selected format* distinct from the *story itself*. Format defaults may guide an initial canvas, but users can override canvas size, layout, page/strip mode, reading direction, panel density, and visual conventions. A prompt that asks for brainstorming or research must not start production. A request to produce reader-facing output waits for the appropriate approved world/character/visual foundations, unless the user explicitly requests a clearly marked provisional experiment.

Start with rough blocking and composition thumbnails on the actual editable canvas. Progress through gesture/pose, anatomy/volume, silhouettes, perspective, environments, props, linework, value/color, lighting, effects, lettering, and polish in reviewable stages. Native editable operations and staged generation do not imply that a limited text-only model can independently produce publication-ready illustration; unsupported steps must be disclosed rather than simulated with false progress.

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


## 18. North-star experience: Kuro as a long-running creative partner

This section makes the intended experience explicit. It is an acceptance target, not a statement that the capabilities already exist.

### 18.1 Conversational creative briefing before execution

- The user can describe art direction, rendering style, storytelling priorities, emotional tone, relationships, pacing, composition, camera language, palette, lighting, and constraints in natural conversation.
- Kuro asks focused follow-up questions when decisions are ambiguous or consequential, summarizes the proposed creative brief, identifies conflicts, and asks for confirmation before starting substantial irreversible or expensive work.
- The brief is editable and versioned. Approved choices become project-scoped direction; suggestions and unresolved questions remain separate from approved decisions.
- Kuro must not make the user fill out a huge form when a short conversation will resolve the uncertainty. She should explain assumptions and ask only the next useful question.
- The workflow supports iterative direction changes without discarding unrelated approved work.

### 18.2 Visible, progressive, editable artwork creation

- Kuro's primary art workflow is a sequence of inspectable native drawing operations, not a hidden one-shot image replacement.
- A representative progression is: reference gathering or user-approved reference import; composition and gesture thumbnail; rough construction; anatomy and perspective pass; clean linework; base colors; shadows; highlights; effects and finishing details. The exact stages vary by style and task.
- Each stage produces editable, named layers or other native document objects when appropriate. The user can watch the real canvas change, inspect the current stage, compare versions, pause, revise instructions, reject a pass, cancel, and undo/rollback safely.
- Progress indicators reflect actual executor state. Kuro never reports a pass as complete until its operations have succeeded and the resulting document has been persisted.
- Reference imagery is clearly distinguished from original artwork and from generated or imported assets. Sources, attribution, licenses, and approval status are retained where applicable.
- Tool execution is deterministic, typed, permission-limited, validated against the current document, and bounded by resource and operation limits. Model output never executes arbitrary code.

### 18.3 Durable memory for long-running series

- The product target includes very long-running series, including a thousand-chapter story, without relying on a single enormous prompt or claiming an unlimited model context window.
- Persistent memory is a structured, project-scoped knowledge system: series and arc summaries; chapter/scene/panel records; event chronology; character state over time; relationship development; motivations and promises; locations and travel; possessions; injuries; deaths; secrets and clues; foreshadowing/payoffs; world rules; visual designs; and approved creative decisions.
- Records retain provenance, story-time validity, publication/chapter order, approval status, and supersession history. Flashbacks and nonlinear storytelling must not be flattened into chapter-number chronology.
- Retrieval combines exact names and aliases, semantic similarity when available, temporal filters, relationship/event graph traversal, and relevance ranking. The system assembles a bounded, task-specific memory packet instead of stuffing the whole archive into every request.
- The system distinguishes established fact, character belief, rumor, inference, proposal, contradiction, unknown, and retconned/superseded information. It tracks what each character knows separately from what is objectively true.
- Before writing or drawing, Kuro retrieves relevant earlier chapters and explains material continuity conflicts. When no reliable evidence is found, she says the memory is missing or uncertain rather than inventing a confident recollection.
- Memory must be inspectable, searchable, editable, exportable, recoverable, and isolated between projects. The user can approve or reject extracted memories; extraction alone never silently establishes canon.
- Memory scale is achieved through durable storage, indexing, summaries, retrieval, and evaluation. Model context limits still apply to each individual request and must be handled transparently.

### 18.4 Cross-device and phone-first compatibility

- The same project model and core creative capabilities should work across phones, tablets, stylus-capable tablets, laptops, desktops, and large displays, with layouts adapted to screen size and input mode rather than simply shrinking desktop UI.
- Phone mode prioritizes conversation, project/story review, reference capture, approvals, lightweight edits, progress monitoring, and safe continuation of queued work. Dense toolbars and multi-panel editing should collapse into usable contextual surfaces.
- Tablet mode prioritizes direct drawing, stylus pressure where supported, palm/touch handling, canvas navigation, reference comparison, and compact palettes.
- Desktop mode supports high-information workflows, keyboard shortcuts, multi-panel layouts, batch operations, and long-form chapter production.
- Phone integration should make importing photos/references, camera capture, sharing into Kuro, opening project/package links, downloading/exporting artwork, and resuming a project straightforward where the platform grants the required permissions. Device features must be permission-gated and degrade gracefully.
- Offline drawing and access to locally available project data are core goals. Online providers are optional for the core editor. Sync, remote inference, and background execution must clearly communicate connectivity, privacy, and platform restrictions.
- Responsive browser support does not by itself prove a native Android/iOS application. PWA, desktop packaging, and mobile wrappers each require their own implementation and device verification. Do not claim background processing, file-system access, stylus behavior, or platform parity until tested on target devices.
- Low-memory phones must receive bounded rendering, lazy-loaded assets, cancellation, recovery, and graceful capability reporting rather than a crash or silent data loss.

### 18.5 Acceptance scenarios for the north star

1. A new creator describes a story and desired visual style conversationally. Kuro asks only necessary clarifying questions, presents an editable brief, and waits for confirmation before major execution.
2. After approval, Kuro creates a panel thumbnail on the real canvas, then adds successive construction, linework, color, shadow, highlight, and detail passes. Every pass is inspectable, editable, undoable, and accurately represented in the action history.
3. A creator returns to a thousand-chapter series and asks about an early relationship, a prior promise, and a later timeline event. Kuro retrieves the supporting source records, explains the relationship's progression, respects story-time order, and distinguishes known facts from missing information.
4. A retcon to a character's injury or relationship state previews affected later chapters and panels before the user approves it.
5. A project created on desktop can be opened on a supported phone or tablet with its canon, visual assets, plans, artwork, history, and approvals intact, subject to documented platform capability and successful round-trip tests.
6. A user can interrupt a long drawing task or lose connectivity, reopen the project, inspect what actually completed, and safely resume or roll back without duplicate or phantom actions.
7. A provider failure, unsupported device feature, or missing memory is reported honestly with a recoverable next step; Kuro never fabricates success or continuity.


## 19. Capability harness: specialist agents, not a thin chat wrapper

Kuro's defining advantage is the purpose-built harness around the selected model provider. Provider models may be small, rate-limited, or have modest context windows; the application must amplify their usefulness through scoped specialist workflows, durable external memory, typed tools, staged reasoning artifacts, validators, evaluators, and deterministic execution. Do not promise that harness design makes any model omniscient or removes its context/token limits. Measure capability at the task level and choose local or hosted models according to quality, latency, cost, privacy, and device constraints.

### 19.1 Orchestrated specialist roles

Design toward narrow, composable roles that can be scheduled by a central orchestrator rather than asking one chat completion to do every job at once. Candidate roles include:
- Creative director: captures intent, asks clarifying questions, maintains the approved art/story brief and detects conflicting instructions.
- Story architect: long arcs, stakes, pacing, setup/payoff, chapter structure, and continuity of cause and effect.
- Dialogue and character-voice editor: natural conversational rhythm, subtext, interruptions, silence, distinct voices, and relationship-specific behavior.
- Canon archivist: extracts candidate facts with citations/provenance, manages temporal validity, retrieves earlier events, and flags contradictions.
- Visual continuity director: tracks character identity, proportions, face/hair, clothing, palette, materials, line language, lighting, and scene-specific state.
- Composition and camera planner: shot size, camera height, lens/perspective intent, angle, blocking, eyelines, silhouettes, focus, depth, and panel-to-panel spatial continuity.
- Panel/storyboard planner: translates scene beats into readable panel sequences, page turns or scroll beats, pacing, and thumbnail compositions.
- Drawing executor: converts approved plans into bounded native canvas commands, checks results, and records provenance.
- Lettering/layout specialist: speech balloons, thought/narration boxes, tails, reading order, typography, safe areas, balloon collisions, and text legibility.
- Critic/QA specialist: checks story logic, dialogue, canon, visual identity, perspective, anatomy, text overflow, panel readability, and whether actual output meets the request.

These roles are logical responsibilities, not a requirement to run a separate expensive model for each step. Use deterministic code, cached results, compact structured outputs, local models, or a shared model when appropriate. Only escalate to more capable/expensive inference when task difficulty justifies it.

### 19.2 Agent harness contract

Each delegated task receives a narrow goal, relevant memory packet, explicit constraints, allowed tools, expected schema, budget/timeout, and completion criteria. Results return as structured artifacts with provenance, confidence or unresolved questions, and validation status. The orchestrator decides whether to accept, repair, retry within bounded limits, ask the user, or stop safely. Untrusted model output is never executable code.

- Separate planning from execution; separate proposals from approved canon.
- Use checkpoints between costly stages and cache stable artifacts by input/version.
- Run cheap deterministic validation before model-based critique where possible.
- Use focused repair loops with bounded attempts, not infinite self-review.
- Support cancellation and propagate it through providers, agents, queues, and native operations.
- Keep user-visible progress tied to real state transitions and completed work.
- Maintain provider/model capability profiles, latency/cost budgets, privacy boundaries, and graceful fallback behavior.
- Never claim that a specialist ran, a memory was consulted, an image was rendered, or a test passed unless the system records that event.

### 19.3 Visual identity and layered character construction

- A character has a stable identity record plus versioned visual invariants and time-specific states: age, hairstyle/length, face shape, proportions, clothing, accessories, injuries, expression range, posture, and permitted variations.
- Maintain approved character sheets, expression sheets, turnarounds, pose references, palette/material swatches, and panel exemplars as versioned source assets. Track which reference is authoritative for which attribute and story period.
- Before generating a panel, retrieve the character's applicable reference bundle and compare the planned shot against identity constraints. Do not treat a prose description alone as sufficient for visual consistency.
- Represent characters and scene elements as separable, named, editable layers/groups where the chosen medium supports it: rough construction, anatomy/massing, face/features, hair, clothing, props, linework, flats, shadows, highlights, effects, lettering, and background. The stack varies by style and asset; avoid rigidly imposing every layer on every image.
- Camera-angle changes must preserve spatial relationships and identity, not merely reuse the same front-facing reference. Support reference turnarounds and perspective/camera plans; clearly disclose when a requested view lacks sufficient evidence and needs a new reference or user review.
- A visual QA pass checks face/shape/hair/clothing/prop consistency, pose readability, perspective, silhouette, lighting direction, layer order, and accidental detail drift. The user can correct a canonical design once and preview affected dependent assets before propagation.
- Preserve source/reference provenance and distinguish editable native construction from flattened imported raster material. Raster imports may be layered or masked where possible but must not be falsely represented as fully vector/editable source geometry.

### 19.4 Lettering and conversational writing quality

- Dialogue must sound like people responding to each other, not a series of isolated exposition speeches. Preserve each character's vocabulary, cadence, humor, defensiveness, emotional restraint, and relationship dynamics.
- Story tools check intention, subtext, beat changes, causality, tension, pacing, and whether a scene changes the relationship or advances the plot. Avoid generic praise, repetitive emotional labels, and dialogue that explains facts every participant already knows.
- Balloon types include speech, thought, narration, whisper, shout, electronic/remote voice, and style variants where supported. Tail direction must identify the correct speaker without crossing or obscuring important art.
- Layout checks reading order, balloon sequence, panel boundaries, text overflow, minimum legibility at export size, safe margins, and collisions with faces/actions. Text remains editable as text objects and is reflowed when dialogue changes.
- Support panel-by-panel dialogue editing, speaker attribution, localization-ready text separation, typography settings, and export validation. Lettering is not merely text baked into an image.

### 19.5 Task-level capability and quality evaluation

Evaluate Kuro as a complete system rather than assuming model size predicts outcome. Maintain repeatable test projects and score:
- Story retrieval accuracy with source evidence and temporal correctness.
- Character voice distinction, conversational naturalness, plot causality, pacing, and payoff tracking.
- Visual identity consistency across expressions, outfits, angles, lighting, and chapter gaps.
- Native-tool correctness, action reversibility, document persistence, and visible progress truthfulness.
- Camera composition, panel readability, balloon order, typography legibility, and export integrity.
- Phone/tablet/desktop usability, interruption recovery, offline behavior, and resource use.

Track failures and regression fixtures over time. A beautiful demo is not proof of reliability; improvements should be demonstrated against fixed representative tasks and human review where subjective quality is involved.


## 20. Production handoff, format conversion, and publishing adapters

Kuro is not complete when a chapter looks finished inside the editor. A creator must be able to package it, validate it, and move it into the format required by the destination platform without rebuilding the chapter manually.

### 20.1 One canonical project, many exports

Keep a durable, editable native project as the source of truth. Exports are derived deliverables, never destructive conversions of the only copy. A chapter/package should preserve, where applicable:
- Final page/panel artwork at configured dimensions and resolution, plus editable source layers and text objects in the native project.
- Reading order, panel/page boundaries, chapter title/number, series metadata, language, credits, and creator-defined publication order.
- Dialogue/lettering source text separately from flattened output where the destination supports it.
- Fonts and asset references with licensing/provenance notes, plus a manifest of included files and any missing/unlicensed resources.
- Export profile, color profile, dimensions, compression, bleed/safe-area settings where relevant, and warnings about lossy flattening or unsupported features.

Provide output profiles for long-strip Webtoon-style vertical comics, paginated manga/comic pages, individual image sequences, PDF proof/review, and a complete editable project/archive. Support high-resolution images without accidental resampling, incorrect ordering, or quality loss. Preserve original project data and offer preview/re-import checks before finalizing an export.

### 20.2 Preflight and release gate

Before export, validate required files, image dimensions/format/size limits, page/panel order, empty or duplicate panels, text clipping, balloon reading order, font availability, metadata, transparent/flattened backgrounds, color conversion, and destination-specific constraints. Show actionable errors and warnings with a preview; never silently discard layers, fonts, text, or unsupported effects. The user explicitly confirms a final package when conversion is lossy.

Every export receives a manifest and reproducible profile settings. Where feasible, include checksums and a validation report so creators can verify that uploaded assets match the approved package. Exports must be repeatable from the same source and settings.

### 20.3 Platform adapter architecture

Use destination adapters behind a common contract: capability discovery, authentication status, format/metadata mapping, preflight, package creation, upload or handoff, draft creation where supported, result/status retrieval, and error recovery. Keep platform-specific constraints out of the editor core. Adapters must declare what they support instead of pretending every site supports every action.

- **MangaDex:** provide a validated export/package workflow and, only where the official API and account permissions permit, a supported chapter-upload flow. Respect MangaDex's current API requirements, manga/chapter metadata, scanlation/translation credits, language, volume/chapter ordering, and community rules. If a safe, supported direct upload is unavailable, deliver a ready-to-upload package with a clear checklist and official destination link.
- **WEBTOON CANVAS:** provide a vertical-scroll export profile that checks image slicing/dimensions, ordering, file limits, text legibility, and episode metadata against current official requirements. Direct publishing is allowed only if an official, authorized integration exists; otherwise provide a ready-to-upload package and guided handoff to the creator's dashboard.
- **Other hosting/publishing services:** add adapters incrementally based on documented official APIs, export requirements, creator demand, and policy/licensing. Avoid brittle scraping, credential collection outside approved auth, or automation that violates platform terms.

### 20.4 User approval, credentials, and publication safety

Publishing is a consequential external action. Prepare, validate, and preview freely; require explicit confirmation before uploading, creating a public draft, scheduling, or publishing. Show the exact destination, account, series, chapter, visibility, files, and metadata before submission. Never publish publicly based on ambiguous chat intent. Keep tokens in the platform's approved secure storage, never in project archives, logs, prompts, or exported manifests. Support revoke/disconnect, least privilege, upload retries that avoid accidental duplicate chapters, and a clear receipt/history of actions.

### 20.5 Delivery states and portability acceptance

Distinguish clearly between: **exported locally**, **preflight passed**, **ready to upload**, **uploaded as draft**, **scheduled**, and **published**. A file existing locally is not proof of an upload; an upload response is not proof of publication. Report the platform's returned status and link only when confirmed.

Acceptance scenarios include: export a vertical episode and paginated chapter from one project without losing the editable source; catch text overflow before packaging; reproduce the same package from the same revision; recover from a failed upload without duplicating a chapter; prepare a ready-to-upload MangaDex package; and prepare a WEBTOON-compatible vertical episode with a destination-specific preflight report. Direct integration acceptance tests must use official documented capabilities and a non-public test/draft path where available.
