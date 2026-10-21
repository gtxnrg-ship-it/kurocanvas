# Kuro Canvas

**Create · Draw · Tell · Together.**

Kuro Canvas is a chat-first, local-first creative studio for manga, manhua, and Webtoon creation. Kuro's defining job is to help develop a story universe and then operate the application's **real, editable drawing tools**—not silently replace the drawing workflow with a flattened, one-shot generated image.

> **Project status: active development · early alpha · not a production release**
>
> **Rough completion estimate:** approximately **45% of the full product vision is implemented in some form**. This is an engineering estimate, not a test-coverage metric. Core foundations exist, but several of the hardest end-to-end workflows and release requirements remain incomplete. **Release readiness is substantially lower than feature-foundation progress.**
>
> **Latest confirmed verification:** on commit [`b82299b`](https://github.com/gtxnrg-ship-it/kurocanvas/commit/b82299b74b4a909182a91b08254dd1b4979ea2da), the automated regression tests, TypeScript checks, and production build passed. The Pages publish job failed because the repository's GitHub Pages site is not enabled/configured yet, so a live hosted preview is **not confirmed**. New commits trigger fresh checks; see [GitHub Actions](https://github.com/gtxnrg-ship-it/kurocanvas/actions) for current results. Build output also warns about large JavaScript/model-runtime assets; performance on low-end phones still needs measurement. Passing automated checks does **not** prove every user journey works or that the app is ready for release.

- **Development branch:** `feat/universe-per-chat-foundation`
- **Pull request:** [#127 — universe-first workspace, continuity memory, and native art-agent harness](https://github.com/gtxnrg-ship-it/kurocanvas/pull/127)
- **CI runs:** [GitHub Actions](https://github.com/gtxnrg-ship-it/kurocanvas/actions)
- **Source code:** [GitHub repository](https://github.com/gtxnrg-ship-it/kurocanvas)

## At a glance: what exists today?

| Area | Current status | Important limitation |
|---|---|---|
| React + TypeScript application shell | Implemented | Needs broader real-device and end-to-end verification |
| Home, chat, canvas, reader, Vault and settings areas | Implemented in the app | Feature completeness and edge cases vary by area |
| Native editable 2D drawing | Implemented | Not all drawing capabilities are available to Kuro through a unified action registry |
| Layers, strokes, drawing revisions and local storage | Implemented | Recovery, migration and cross-device portability need more verification |
| Universe/conversation separation and resume flows | Implemented on this branch | Isolation needs continued regression and end-to-end testing |
| Canon, story memory, character evolution and relationships | Foundation implemented | Retrieval quality, evidence coverage and long-story behavior are not guaranteed |
| Native drawing-agent execution | Partial | Broader action coverage, real-document read-back, iterative visual QA and robust rollback/cancellation remain |
| Local browser model | Experimental | Text-only small model; quality and device performance are unverified |
| Hosted OpenAI-compatible provider | Integration implemented | Requires a compatible endpoint and valid configuration |
| Portable project/export workflows | Partial | Round-trip, corruption handling and full asset portability require more testing |
| Android APK | **Not available yet** | No verified installable APK release is published |
| Production readiness | **Not ready** | Needs broader end-to-end, accessibility, performance, security and real-device validation |

Statuses describe the code and current development scope; they are not a promise that every row is fully verified.

## Try Kuro Canvas now

### Option 1 — Open the development workspace

**[Open Kuro Canvas in StackBlitz](https://stackblitz.com/github/gtxnrg-ship-it/kurocanvas/tree/feat/universe-per-chat-foundation?startScript=dev)**

This opens a browser-based development environment. It may take time to install dependencies and start the app. It is a development workspace, not a stable hosted release, and it may not work if the repository or branch is inaccessible to StackBlitz.

### Option 2 — Open the hosted preview

**[Try the GitHub Pages preview](https://gtxnrg-ship-it.github.io/kurocanvas/)**

This is the intended development-preview URL. Availability depends on GitHub Pages being enabled and a successful deployment having completed. A repository maintainer must enable Pages once in **Settings → Pages → Build and deployment → Source: GitHub Actions**; the CI integration cannot create the Pages site because it lacks repository administration permission. Then check the [deployment workflow](https://github.com/gtxnrg-ship-it/kurocanvas/actions/workflows/deploy-pages-preview.yml). A successful CI run alone does not prove that Pages has been enabled or that a deployment is live.

### Option 3 — Run it locally

Requirements: **Node.js 20+** and npm.

```bash
git clone https://github.com/gtxnrg-ship-it/kurocanvas.git
cd kurocanvas
git switch feat/universe-per-chat-foundation
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). Keep the terminal running while you use the app.

Run the project's checks before submitting changes:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run preview` serves the already-built production bundle; run `npm run build` first.

### Quick manual smoke test

After the app opens, use this checklist to test the most important paths rather than judging only the home screen:

- [ ] Create a new universe and confirm its first conversation opens.
- [ ] Send a message. If a model is not connected, confirm the app reports that state instead of pretending a response was generated.
- [ ] Open the canvas, draw a few strokes, change tools/layers, and wait for the save indicator.
- [ ] Open the reader and confirm it shows the saved drawing from the active universe—not sample chapter art.
- [ ] Refresh or reopen the app and check that the universe, conversation and drawing remain available.
- [ ] Create a second universe and confirm its conversation and saved drawings are separate.
- [ ] In the first universe, ask Kuro for a drawing plan if a provider is connected. Inspect the proposed actions and approve only if the preview looks right.
- [ ] Export a project if available, then test the exported file before relying on it as a backup.

This is a practical smoke test, not a substitute for the full release test suite. Report failures with the browser/device, exact steps, and any visible error message.

## Android APK download

**There is no verified, installable Kuro Canvas APK published yet.** The current project is a web application built with React, TypeScript and Vite. A web app running in an Android browser is not the same thing as a packaged Android application, and we should not label an unverified build as an APK.

- **[Check official Kuro Canvas releases](https://github.com/gtxnrg-ship-it/kurocanvas/releases/latest)** — if a release later includes an APK, download it only from the official release assets.
- **[Browse all releases](https://github.com/gtxnrg-ship-it/kurocanvas/releases)**.
- **Current way to test on Android:** open the hosted preview above in Chrome if it is available, or run the app locally and access it from the phone on the same network. The local development server must be reachable from the device.
- **Home-screen shortcut:** you may be able to use Chrome's **Add to Home screen** menu, but this is only a browser shortcut—not a packaged or verified installable app. No offline guarantee is made, and browser storage can be cleared by the user or operating system.

Before an APK can be advertised as downloadable, the project needs a verified Android packaging path, a reproducible build, application ID/versioning, appropriate permissions and storage behavior, installation testing on real devices, and a release artifact attached to an official GitHub release. Signing and update/distribution instructions must also be documented. **The links above are release destinations, not a claim that an APK is currently available.**


## What Kuro is designed to become

Kuro is intended to be a persistent creative partner for long-running manga, manhua and Webtoon projects. A user should be able to explore a fictional universe for as long as needed, establish and approve its canon, and then develop chapters without repeatedly explaining the world.

The target workflow is:

1. **Develop the universe.** Discuss themes, world rules, characters, relationships, arcs, reveals, foreshadowing and visual style.
2. **Build reliable canon.** Preserve source conversations, evidence, temporal history and explicit approved/proposed/inferred/contradicted/superseded states.
3. **Plan a chapter.** Turn an approved brief into an outline, scene breakdown, dialogue and panel-by-panel composition.
4. **Draw natively.** Build editable rough thumbnails, poses, forms, backgrounds, linework, colors, effects and lettering on the actual canvas.
5. **Observe and intervene.** Let the user pause, cancel, approve, revise and undo meaningful operations.
6. **Protect continuity.** Reuse approved characters, outfits, props, environments and reference views; flag conflicts instead of silently inventing canon.
7. **Save and resume.** Preserve the universe, conversations, plans, editable artwork, assets, approvals and history.
8. **Export reliably.** Validate the project, include required assets, preserve editability where supported, and verify that exported projects can be reopened.

**Defining requirement:** the model is the planner and operator; the native drawing engine creates the editable artwork. A generated image must never silently substitute for the promised drawing process.

## Product principles

- **Chat-first and tool-driven:** Kuro plans and invokes typed creative actions.
- **Editable artwork:** strokes, layers, lettering, panels and supported scene assets remain editable.
- **Local-first core:** drawing and access to saved work should not require an account or hosted model.
- **Continuity with evidence:** approved canon is separate from suggestions and inference.
- **Universe isolation:** a new chat starts a new universe by default; joining an existing universe is an explicit action.
- **Safe execution:** validate model-proposed commands, checkpoint changes and preserve undo/recovery.
- **Honest status:** no fake research, fake tool activity, invented completion, or claims that unverified behavior works.

## Model and provider status

Kuro has an optional OpenAI-compatible provider interface and an experimental browser-local model provider.

The current local baseline is **SmolLM2-135M-Instruct**, using a quantized ONNX model through Transformers.js. The download is roughly 137 MB, depending on the model artifacts. It is **text-only**, has not been fine-tuned for Kuro, and has not been validated for the full creative-agent workflow. Its availability does not imply strong reasoning, reliable tool use, vision, or high-quality manga planning. Browser caching can be evicted; this is not a permanent native model installation.

The optional endpoint smoke test checks model discovery, text generation and an image-input response against a running OpenAI-compatible endpoint. By default it targets `http://127.0.0.1:8000/v1`.

```bash
npm run model:smoke
```

Optional environment variables:

- `KURO_MODEL_BASE_URL` — compatible endpoint base URL.
- `KURO_MODEL_ID` — model ID served by that endpoint.
- `KURO_MODEL_API_KEY` — API key, if the endpoint requires one.

The smoke test uses a small synthetic test image rather than project artwork and does not measure creative quality. See [Local intelligence model strategy](docs/KURO-LOCAL-INTELLIGENCE-MODEL-STRATEGY.md) and [Model acceptance gate](docs/KURO-MODEL-ACCEPTANCE.md).

## What remains before a serious release

The work is ordered by dependency, not visual novelty:

1. **Close the user journey:** verify first launch, create universe, create/resume conversation, chat, switch workspace, save, reopen and recover on mobile and desktop.
2. **Enforce data ownership:** scope transcripts, canon, relationship events, drawings, revisions, tasks and assets to the correct universe. Deny cross-universe access by default.
3. **Unify native actions:** route manual and agent operations through a shared typed registry with strict validation, checkpoints, cancellation, undo/rollback and provenance.
4. **Complete the feedback loop:** read back the actual document, render the result, detect measurable defects and revise through supported tools.
5. **Strengthen continuity:** track character knowledge, relationship changes, emotional history, appearance states, timeline and source evidence. Keep approved canon separate from proposals.
6. **Finish portable projects:** validate archive paths and schemas, handle missing assets, preserve editable layers and test import/export round-trips.
7. **Harden the UI:** consistent loading, empty, error and recovery states; responsive layouts; keyboard/touch accessibility; reduced-motion support.
8. **Validate models and devices:** benchmark latency, memory and quality on representative phones/tablets/desktops; disclose unsupported capabilities; keep hosted providers optional.
9. **Package Android:** create and verify a reproducible Android build, test installation and upgrades on real devices, and publish the APK through an official release.
10. **Release only on evidence:** pass typecheck, tests, production build, end-to-end workflows, security checks, accessibility checks and device testing. Report every remaining limitation.

## Engineering and contributor guidance

Before changing code, read the relevant product and architecture documents, inspect the current branch and CI, and identify the earliest incomplete dependency. Make coherent changes with regression tests. Update the roadmap alongside implementation. Mark a feature **Verified** only when a relevant automated check or reproducible end-to-end test actually passed.

Treat model output and imported files as untrusted. Never execute arbitrary model-authored code. Keep provider secrets out of project files and logs. Require explicit approval for destructive operations and canon retcons. Preserve user data during migrations and never guess which universe legacy content belongs to.

### Status vocabulary

- **Planned:** not implemented.
- **In progress:** implementation is underway.
- **Implemented:** code exists; end-to-end behavior may not be verified.
- **Verified:** a relevant check or reproducible test passed.
- **Blocked:** a known dependency or failure prevents progress.

## Key project documents

- [Universe architecture and UI](docs/UNIVERSE-ARCHITECTURE-AND-UI.md)
- [Canon and memory contract](docs/CANON-MEMORY.md)
- [Native art-agent execution contract](docs/KURO-ART-AGENT-NATIVE-EXECUTION.md)
- [Kuro personality and conversation harness](docs/KURO-PERSONALITY-AND-CONVERSATION-HARNESS.md)
- [Local intelligence model strategy](docs/KURO-LOCAL-INTELLIGENCE-MODEL-STRATEGY.md)
- [Model acceptance gate](docs/KURO-MODEL-ACCEPTANCE.md)
- [Cross-platform and low-end performance strategy](docs/CROSS-PLATFORM-PERFORMANCE.md)
- [Open pull request](https://github.com/gtxnrg-ship-it/kurocanvas/pull/127)
- [Build and test status](https://github.com/gtxnrg-ship-it/kurocanvas/actions)

## Official icon

The supplied official Kuro Canvas icon is the source of truth and must be used unchanged. Do not replace it with a generated alternative. If the original icon asset is missing from the build, restore the official source asset rather than improvising a substitute.

## License

No license has been selected yet. Do not assume this repository is open source until a license is explicitly chosen.

---

**Current release decision: not ready for production or APK distribution.** The branch is progressing and its configured CI checks currently pass, but the complete creative-agent loop, platform packaging and full end-to-end validation are still required.
