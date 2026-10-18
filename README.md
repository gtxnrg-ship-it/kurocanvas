# Kuro Canvas

**Create · Draw · Tell · Together.**

Kuro Canvas is planned as a chat-first, AI-assisted creative studio for manga, manhua, and Webtoon creation. Kuro should operate real, inspectable drawing tools; one-shot image generation is not the core workflow.

## Current status

This foundation commit establishes a responsive React + TypeScript + Vite interface prototype. Navigation, chat flow, workspace panels, reader view, and creative-vault view are UI scaffolding. Tool activity and scene art are illustrative; a production drawing engine, persistent project storage, real AI tool execution, and export pipeline are not implemented yet.

## Product principles

- **Chat-first, tool-driven:** Kuro plans work and invokes typed creative tools; users can observe, review, undo, and approve changes.
- **Editable artwork:** strokes, layers, text, panels, and scene assets remain editable.
- **Adaptive UI:** phone, stylus tablet, desktop, and large-screen layouts adapt to available space and input capabilities.
- **Reusable creative memory:** approved character sheets, environments, camera views, templates, and visual references are versioned and searchable.
- **Continuity-aware:** story facts, temporal states, and approvals are separate from AI suggestions.
- **Local-first core:** core editing and project access should not require an account or server.
- **Honest status:** illustrative previews are never presented as completed tool execution.

## Development

Node.js 20+ recommended.

    npm install
    npm run dev
    npm run typecheck
    npm run build
    npm run preview

## Planned architecture

1. Responsive application shell and design system
2. Real 2D drawing engine, editable action history, layers, and stylus/touch input
3. Versioned local project model, autosave, recovery, and .kuro package format
4. Typed Kuro tool registry with preview/approval/undo semantics
5. Creative vault, template versions, asset provenance, and dependency tracking
6. Infinite/virtualized Webtoon workspace and comic-specific editing tools
7. 3D reference studio with lazy asset loading and resource cleanup
8. Export pipeline: raster images, layered interchange evaluation, PDF, and Webtoon export presets
9. Canon and continuity engine, research provenance, optional model providers
10. Automated tests, device benchmarks, accessibility, and release pipeline

## Official Kuro icon

The supplied official Kuro Canvas icon is the source of truth and must be used unchanged. Add the original image at public/kuro-icon.png when available in the build workspace. Do not replace it with a generated alternative. The current logo mark is a temporary placeholder.

## License

No license has been selected yet. Do not assume this repository is open-source until a license is explicitly chosen.


## Kuro's future: product vision and long-term contract

This section is the quick-start context for any future contributor, coding agent, or separate ChatGPT conversation. Read this README, `ROADMAP.md`, `ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/CANON-MEMORY.md`, and `docs/DRAWING-ACTIONS.md` before proposing changes. The repository—not a single chat transcript—is the durable project source of truth.

### What Kuro Canvas is meant to become

Kuro is a persistent creative partner for building long-running manga, manhua, and Webtoon series. The user should be able to talk through an entire fictional universe, establish and approve its canon, and then ask Kuro to plan and create chapters without repeatedly re-explaining the world.

Kuro should:
1. Help develop the series foundation: world rules, themes, characters, relationships, arcs, reveals, foreshadowing, visual style, and chapter goals.
2. Maintain a searchable, project-scoped canon with sources, temporal history, and explicit approved/proposed/inferred/contradicted/superseded states.
3. Turn an approved chapter brief into an outline, scene plan, and editable panel-by-panel plan.
4. Draw on the actual native canvas: start with visible rough stick-figure thumbnails and composition, then progressively refine poses, shapes, backgrounds, linework, lighting, lettering, and detail.
5. Make every meaningful AI operation observable. The user can inspect, pause, cancel, approve, revise, and undo work; completion messages must correspond to actual successful operations.
6. Reuse approved characters, costumes, props, environments, panel templates, and 3D reference setups while warning about continuity and dependency impacts.
7. Save the universe, plans, editable artwork, assets, approvals, and history into a portable project that can be reopened on another device.
8. Work local-first for core drawing and project access. Online models and research are optional integrations, and their data-sharing implications must be clear.

**The defining requirement:** the AI is the planner and operator; the native drawing engine is what creates the editable artwork. A generated image must never silently substitute for the promised panel-by-panel drawing process.

### The intended end-to-end experience

1. **Create a series:** discuss the universe and approve a structured series bible.
2. **Remember accurately:** store canon as durable records, distinguish unknown from false, separate world truth from what each character knows, and retain provenance.
3. **Plan:** propose a chapter outline, scene breakdown, dialogue and panel composition.
4. **Thumbnail:** create rough stick figures and panel layouts as real canvas operations the user can watch.
5. **Refine:** progressively draw and revise each panel using safe, typed native tools.
6. **Review:** validate continuity, visual consistency, pacing and lettering; show conflicts instead of silently inventing canon.
7. **Package:** save and export the complete project, close the app, reopen it, and continue without losing the universe or artwork.

### Product boundaries and safety

- Do not fake model activity, tool execution, approval, continuity checks, research, or export success.
- Do not execute arbitrary code produced by a model. Model output must be schema-validated and routed through an allowlisted tool registry.
- Use explicit approvals for destructive operations and canon retcons; preserve undo/checkpoint recovery where feasible.
- Keep project memory private and project-scoped by default. Never store provider secrets in project files or logs.
- Be honest about provider capabilities, local-model requirements, platform support, and any unverified behavior.
- Treat imported files and model output as untrusted input.
- Prefer small, reviewable PRs that preserve working features and include tests or documented verification.

### Persistent handoff rules for every contributor or coding agent

Before changing code:
1. Read this section and the roadmap/architecture documents listed above.
2. Inspect the current `main`, open PRs, CI status, and relevant source files; do not rely only on prior chat summaries.
3. Find the earliest incomplete dependency in `ROADMAP.md`. Do not skip foundations to build disconnected UI.
4. Make the smallest coherent change that moves a real user workflow forward.
5. Update `ROADMAP.md` in the same PR as the implementation: mark items **In progress**, **Implemented**, **Verified**, or **Blocked** accurately, add the PR link, and record any newly discovered work.
6. Update `docs/DECISIONS.md` if an architectural or product decision changes. Update the relevant design document when contracts change.
7. Run available checks and report exactly what passed or failed. Never claim a build or device test passed without evidence.
8. After merge, verify the PR is merged and update the roadmap's current status before starting dependent work.

### Progress status meanings

- **Planned:** not implemented.
- **In progress:** work is underway.
- **Implemented:** code exists, but end-to-end behavior may not be verified.
- **Verified:** a relevant CI run or reproducible end-to-end test passed.
- **Blocked:** a known dependency or failure prevents progress.

Keep the roadmap concise enough to use as a working checklist, but detailed enough that a new coding tool can resume without needing access to previous conversations. Do not mark the whole product "done" merely because a foundation or placeholder exists.


## Complete product specification

The exhaustive, tool-independent requirements and acceptance contract lives in **[docs/PRODUCT-SPEC.md](docs/PRODUCT-SPEC.md)**. It covers the full target experience: series/world planning, up-to-500-character canon memory, temporal continuity, native drawing-action execution, panel-by-panel rough-to-finished artwork, Creative Vault, optional 3D references, research/licensing, local-first storage, the portable .kuro package, provider/security requirements, device support, export/publishing, testing, and ordered milestones.

**For any new chat or coding tool:** start with this README, then read [the product specification](docs/PRODUCT-SPEC.md) and [the master roadmap](ROADMAP.md). The specification is the target; the roadmap is the live implementation status. Never infer a feature is finished merely because it is described here.
