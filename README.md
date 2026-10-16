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
