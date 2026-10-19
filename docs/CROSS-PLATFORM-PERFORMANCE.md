# Cross-platform and performance strategy

Status: Architecture decision for the current React + TypeScript + Vite codebase. This is a staged plan, not a claim that native desktop/mobile packaging or a Rust engine already exists.

## Decision

Do not rewrite the current application just to chase a supposedly universal language. Keep **TypeScript + React** for the product UI and application orchestration while the app is young. It is the fastest way to share UI, workflows, memory interfaces, project management, and settings across web and desktop, and it is already the language of this repository.

For performance-critical deterministic drawing and document processing, establish measured boundaries and consider a **Rust core** compiled to WebAssembly for browser use and native Rust libraries for desktop/mobile builds. Adopt it only when profiling demonstrates a bottleneck and the same tested API can serve all targets. Do not move every subsystem to Rust.

## Target delivery model

- **Web/PWA:** Vite/React/TypeScript; offline shell and local-first project storage; graceful degradation for browsers with limited memory/GPU.
- **Desktop:** package the same UI in Tauri when desktop requirements and platform support are verified. Keep native file access, updates, permissions, and model runtimes behind explicit adapters. Evaluate Electron only if required ecosystem features outweigh its larger footprint.
- **Android/iOS/tablets:** reuse shared UI where it meets touch, stylus, accessibility, file access, lifecycle, and performance requirements. Evaluate Capacitor or a native shell per platform; do not promise full native parity before testing. iOS distribution, background execution, filesystem access, and WebGPU availability have platform-specific constraints.
- **Optional local inference:** model runtime is a separate capability/plugin. Hardware detection and memory budgets determine whether a local model is feasible. Remote providers remain optional; drawing/editing and opening local projects must not require a model connection.
- **Shared core:** keep versioned project/canon schemas and deterministic command semantics independent of UI. Use TypeScript first; add Rust/WASM only for measured hot paths such as stroke processing, geometry, compositing, indexing, or package compression.

## Buttery-smooth performance contract

Performance is a measured product feature, not a promise that every device can run every model.

1. Use a single animation-frame drawing loop; coalesce pointer events, avoid React state updates per pointer sample, and keep high-frequency input in refs/engine buffers.
2. Render only dirty regions when feasible; batch paths; cache stable layer surfaces; avoid rebuilding every layer on every render.
3. Virtualize large chapter lists, canvases/panels, timelines, vault results, and long chat histories.
4. Store large artwork as bounded binary assets/chunks rather than base64-heavy JSON; stream imports/exports and never load a huge project entirely into memory unnecessarily.
5. Use workers for expensive non-DOM tasks (indexing, compression, geometry, thumbnail creation) and OffscreenCanvas only where supported, with a fallback.
6. Lazy-load 3D, vision, embeddings, and optional model runtimes; dispose GPU resources; keep the default 2D workspace light.
7. Autosave with debounce, checkpoints and recovery; do not block input while saving. Handle quota errors, storage eviction and private-browsing limitations honestly.
8. Support reduced-motion, keyboard navigation, screen readers, touch, pen pressure when available, palm rejection where platform APIs support it, and mouse fallback.
9. Profile on representative low-end Android, mid-range Android, tablet/stylus, low-memory laptop, and desktop. Measure startup, drawing input latency, frame-time percentiles, memory, project open/save, chapter scrolling, and export.
10. Prefer graceful degradation: lower preview resolution, fewer concurrent tasks, smaller thumbnails, disable optional 3D/AI features, and preserve core drawing. Never silently lower the quality of saved source artwork.

## Initial engineering targets (validate on real devices)

- Drawing input should feel immediate; target under 16 ms median and under 33 ms p95 from input event to visible update on supported reference devices, with clear fallback behavior on slower hardware.
- Keep routine UI interactions responsive and avoid long main-thread tasks; move expensive work off the main thread where feasible.
- Establish device-class-specific memory budgets before selecting defaults. Never advertise a universal RAM requirement until benchmarks exist.
- Large projects must open progressively with visible loading/recovery and cancellation rather than freezing the app.
- Use benchmark baselines and regression thresholds in CI where deterministic; retain a real-device performance suite for GPU, stylus, and thermal behavior.

## AI/model strategy

- Separate task routing from model vendors. Capability metadata must be honest and provider-specific.
- Use small/fast models for lightweight classification or formatting only when they meet quality needs; use stronger reasoning/planning models for complex story and tool plans.
- Local model selection depends on actual RAM, quantization, accelerator, context size, and runtime support; do not assume a 100 MB model can deliver reliable high-level story reasoning.
- Stream chat responses when supported, cancel stale requests, impose timeouts, cap response sizes, validate structured output, and never execute arbitrary model-generated code.
- AI is optional for drawing and project access. A disconnected provider must not prevent editing, saving, undoing, or exporting.
- Keep API secrets out of browser storage and packages. Browser-delivered secrets cannot be treated as private; use a secure backend or user-controlled local endpoint when required.

## Release gates before calling Kuro cross-platform or smooth

- Automated unit and integration tests for command validation, undo/inverses, layer isolation, persistence/recovery, package validation, provider errors/cancellation, and project migration.
- End-to-end tests for creating, saving, closing, reopening, editing and exporting a project.
- Device testing for touch, stylus pressure, orientation/resizing, memory pressure, app lifecycle, and offline behavior.
- Accessibility and keyboard tests.
- Benchmark evidence for low-end hardware, plus crash/recovery testing with large projects.
- Security review for imported files, model outputs, URL handling, permissions, and credential storage.
- A platform is only marked supported after a real build/install/test on that platform.

## Phased migration

1. Profile the existing React canvas and remove obvious redraw/state bottlenecks before adopting new languages.
2. Finish the deterministic drawing engine, action queue, cancellation, undo and tests.
3. Establish shared project/command interfaces and benchmark fixtures.
4. Optimize TypeScript hot paths; add Web Workers and canvas caching where justified.
5. If measurements still show CPU-bound hot paths, prototype a small Rust/WASM module behind the stable engine interface and compare on low-end devices.
6. Add desktop/mobile packaging one target at a time with CI builds and real-device acceptance tests.
7. Add optional 3D and local inference only after lazy loading and memory budgets are proven.

## Non-goals

- No blanket rewrite in Rust, Flutter, or another framework without evidence.
- No guarantee that all AI models run offline on low-end hardware.
- No fake benchmark claims or blanket “works on every device” statement.
- No use of generated images as a substitute for editable native drawing actions.
