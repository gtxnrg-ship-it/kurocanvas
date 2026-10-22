# Kuro Canvas

> 📱 **Android test APK is available:** [Download the debug APK](https://github.com/gtxnrg-ship-it/kurocanvas/releases/download/android-dev-latest/kuro-canvas-debug.apk) · [Release details and source commit](https://github.com/gtxnrg-ship-it/kurocanvas/releases/tag/android-dev-latest)  
> **Latest published APK provenance:** see the [release details and source commit](https://github.com/gtxnrg-ship-it/kurocanvas/releases/tag/android-dev-latest) for the source SHA and the asset's SHA-256 digest. The APK link above always targets the rolling release; it can temporarily lag behind `main` while the Android workflow is running. This is debug-signed test software, not a production or Play Store release. It has not been smoke-tested on a physical device in this audit.

**Create · Draw · Tell · Together.**

## What Kuro is — and what she is not

**Kuro is a tool-using creative agent, not a generative-image chatbot.** Her drawing path is to reason about a request, propose structured native actions, validate them against the active document, then operate the application's real editable tools. The canvas renders and stores real editable strokes, shapes, text, layers, and revisions. Kuro's drawings are not flattened pictures returned by an image-generation endpoint. The agent must report success only after the application executes the actions and verifies the saved document.

Kuro is intended to be the creator's research and worldbuilding partner as well: research references, help design fictional cultures, neighborhoods, homes, history, institutions, economies, power systems and relationships, and preserve approved decisions in a project-scoped World/Vault. Character ages, injuries, healing, scars, outfits, relationships, knowledge and locations should evolve with story time; earlier chapters should remain revisitable, and planned cameos/Easter eggs should be tracked without accidentally revealing their payoffs to readers.

**Important implementation boundary:** the architecture has real native drawing commands, editable-document execution, a 3D viewport, model import/blockout support, research, and story-memory foundations. It is not yet a finished professional drawing agent or a complete 3D modeling/rigging engine. A model can propose actions; only implemented tools can execute them. Unbounded context does not literally exist—the application has to retrieve relevant long-term records under model context limits. This README distinguishes implemented code from end-to-end capabilities that still need verification.

Kuro Canvas is a chat-first, local-first creative studio for manga, manhua, and Webtoon creation. The intended workflow is conversational worldbuilding plus direct operation of real editable creative tools—not one-shot flattened image output.

> **Project status: active development · early alpha · not a production release**
>
> **Completion percentage:** no single repository-wide percentage is currently defensible. Individual feature areas have different levels of implementation and verification; see the roadmap below. Do not treat a green build or existing component as proof of a complete user journey.
>
> **Verification status:** Every push to `main` triggers automated regression tests and a TypeScript/Vite production build. See [GitHub Actions](https://github.com/gtxnrg-ship-it/kurocanvas/actions) for the latest commit’s exact result. A green build is necessary, not sufficient: browser-level package round trips, low-end Android performance, accessibility, and complete end-to-end journeys still need real-device validation. The Pages workflow now follows `main`, but a live hosted preview is **not confirmed** until the repository’s Pages site is enabled and deployment succeeds.

- **Primary development branch:** `main`
- **Merged foundation:** [#127 — universe-first workspace, continuity memory, and native art-agent harness](https://github.com/gtxnrg-ship-it/kurocanvas/pull/127) (merged; retained as implementation history)
- **CI runs:** [GitHub Actions](https://github.com/gtxnrg-ship-it/kurocanvas/actions)
- **Source code:** [GitHub repository](https://github.com/gtxnrg-ship-it/kurocanvas)

## At a glance: what exists today?

| Area | Current status | Important limitation |
|---|---|---|
| React + TypeScript application shell | Implemented | Needs broader real-device and end-to-end verification |
| Home, chat, canvas, reader, Vault and settings areas | Implemented in the app | Feature completeness and edge cases vary by area |
| Native editable 2D drawing | Implemented | Not all drawing capabilities are available to Kuro through a unified action registry |
| Layers, strokes, drawing revisions and local storage | Implemented | Browser/device recovery and migration still need broader verification |
| Universe/conversation separation and resume flows | Implemented in main | Isolation needs continued regression and end-to-end testing |
| Canon, story memory, character evolution and relationships | Foundation implemented | Retrieval quality, evidence coverage and long-story behavior are not guaranteed | 
| Character design → World & Vault | Implemented in main: a finished/paused Live Creation session can link its saved editable drawing to a proposed character, proposed visual-timeline state and linked story-memory record | Creator must confirm appearance traits and chronology. These stay proposed until approved; the text-only model does not inspect image pixels. Approval persistence and next-chapter continuity still need an end-to-end device/browser check |
| Rich chat replies and safe Markdown rendering | Implemented | Links open externally; raw HTML is not executed and arbitrary embedded image URLs are not auto-loaded |
| Chat visual-reference lookup | Implemented | Explicit searches use Wikimedia Commons; attribution and license are displayed, and saved items remain proposals until reviewed |
| Chat research queue | Implemented | Explicit research commands queue Wikipedia/Crossref source collection; completion and source quality still require review |
| Native drawing-agent execution | Partial | Approved native plans now require persisted read-back and verified rollback; action coverage and iterative visual QA remain incomplete |
| Mobile native-plan workflow | Implemented in main | Compact phones can approve a validated plan and inspect its editable result; manual freehand canvas controls stay simplified. Physical Android touch/scroll checks remain open |
| Nonlinear character visual chronology | Implemented in main | The Style Bible now distinguishes a chapter-targeted request from explicit in-world story order; browser-level approval/reload/next-chapter validation remains open |
| Project JSON export download | Browser/WebView revoke timing fixed in main | Delayed object-URL cleanup has tests, but exporting and opening a real backup on Android/iOS still needs smoke testing | 
| Chat-to-Live-Creation routing | Implemented in main | Explicit draw/visual artifact requests route from chat; ambiguous phrases still need creator direction, and only supported editable native actions can execute |
| Qwen3-0.6B local model | Experimental | The only active text-only model; runs in a browser worker with cancellation and local speed benchmark. Quality, download reliability and Android performance still need real-device verification |
| Replaceable model adapter | Implemented | Future upgrades use the `ModelProvider` seam and require tests/benchmarks; no model carousel or silent remote fallback |
| Live voice session (experimental) | Fish Audio Drama 3 output with SAKURA, Chiaki Nanami and Mitsuri voice profiles; configurable natural/subtle-Japanese/more-noticeable-Japanese English delivery direction; local Kokoro/device alternatives; microphone and playback level meters; one stable Kuro personality | Fish Audio requires your own API key and a network connection. Spoken reply text (which may contain story details) is sent to Fish Audio. The API key is kept in sessionStorage, not encrypted, and is not intentionally persisted across browser sessions. Accent directions are prompts, not a guaranteed acoustic accent. Android WebView recognition, speech interruption and full-device behavior need hands-on testing. |
| Portable project/export workflows | Native `.kuro` ZIP archive export with a manifest and CRC-checked asset entries; legacy `.kuro.json` imports remain supported | 50 MB cap, STORE/no compression, unlinked canvases and binary reference images are not included; full browser round-trip and corruption recovery still need hands-on verification |
| Android APK | Rolling debug-signed APK published | The release page records the source commit and SHA-256; install/launch and low-end Android validation still need a physical-device test |
| Production readiness | **Not ready** | Needs broader end-to-end, accessibility, performance, security and real-device validation |

Statuses describe the code and current development scope; they are not a promise that every row is fully verified.

## Try Kuro Canvas now

### Option 1 — Open the development workspace

**[Open Kuro Canvas in StackBlitz](https://stackblitz.com/github/gtxnrg-ship-it/kurocanvas/tree/main?startScript=dev)**

This opens a browser-based development environment. It may take time to install dependencies and start the app. It is a development workspace, not a stable hosted release, and it may not work if the repository or branch is inaccessible to StackBlitz.

### Option 2 — Open the hosted preview

**[Try the GitHub Pages preview](https://gtxnrg-ship-it.github.io/kurocanvas/)**

This is the intended development-preview URL. Availability depends on GitHub Pages being enabled and a successful deployment having completed. A repository maintainer must enable Pages once in **Settings → Pages → Build and deployment → Source: GitHub Actions**; the CI integration cannot create the Pages site because it lacks repository administration permission. Then check the [deployment workflow](https://github.com/gtxnrg-ship-it/kurocanvas/actions/workflows/deploy-pages-preview.yml). A successful CI run alone does not prove that Pages has been enabled or that a deployment is live.

### Option 3 — Run it locally

Requirements: **Node.js 22+** and npm (Capacitor 8 requires Node 22 or newer).

```bash
git clone https://github.com/gtxnrg-ship-it/kurocanvas.git
cd kurocanvas
git switch main
npm ci
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
- [ ] Open Preferences, check or prepare Qwen3-0.6B, then send a message. Confirm model errors are reported plainly and no hosted fallback is attempted.
- [ ] Open Preferences → Spoken voice, add your own Fish Audio API key, and test SAKURA, Chiaki Nanami and Mitsuri with English text. Try all three English-accent directions (natural, subtle Japanese-inflected, more noticeable Japanese-inflected); a prompt direction is not proof of the resulting accent. Verify that only the spoken text is sent to Fish Audio.
- [ ] Start Live Creation voice mode, speak an English sentence, check both audio meters, then use “Interrupt Kuro” during speech and speak again. Verify recognition resumes; stop the session and leave Live Creation, confirming microphone capture and playback stop.
- [ ] Change the speech engine to Kokoro Local or Device voice and confirm the app never requires a Fish Audio key for those alternatives.
- [ ] Open the canvas, draw a few strokes, change tools/layers, and wait for the save indicator.
- [ ] Open the reader and confirm it shows the saved drawing from the active universe—not sample chapter art.
- [ ] Refresh or reopen the app and check that the universe, conversation and drawing remain available.
- [ ] Create a second universe and confirm its conversation and saved drawings are separate.
- [ ] In the first universe, ask Kuro for a drawing plan after the local Qwen model is prepared. Inspect the proposed actions and approve only if the preview looks right.
- [ ] Export a project, import it as a separate copy, and verify drawings, revision checkpoints, chat transcripts and chapter/relationship continuity before relying on it as a backup.
- [ ] Ask Kuro to find reference images for a concrete subject; confirm real thumbnails, source pages, creator/license labels, and that saving creates a proposal rather than approved canon.
- [ ] Ask Kuro to research a topic with sources; confirm a durable queue task appears in Research Lab and that a follow-up like “summarize those findings” includes saved source URLs.

This is a practical smoke test, not a substitute for the full release test suite. Report failures with the browser/device, exact steps, and any visible error message.

## Android APK download

**[Download the latest Android test APK](https://github.com/gtxnrg-ship-it/kurocanvas/releases/download/android-dev-latest/kuro-canvas-debug.apk)**

The [Android APK workflow](https://github.com/gtxnrg-ship-it/kurocanvas/actions/workflows/android-apk.yml) runs the required typecheck/test/production-build sequence, packages the web app into a Capacitor Android project, and assembles an installable debug APK. The rolling development release at the direct link above contains the latest successful published build and its release notes identify the source commit. Each run also attaches a **kuro-canvas-debug-apk** workflow artifact.

- Check the release notes' source commit before installing if a newer build is still running; alternatively, open [Android build runs](https://github.com/gtxnrg-ship-it/kurocanvas/actions/workflows/android-apk.yml), select the successful run for the exact commit you want, and download its **kuro-canvas-debug-apk** artifact.
- The APK is **debug-signed for testing**, not signed for Play Store or production distribution. Review the build's source commit and SHA-256 file in the release/artifact.
- Each CI run can use a new debug signing key. If Android refuses to install an update over an older test build, uninstall the previous test APK first, then install the new one.
- This packages the current web application in an Android WebView; it does **not** prove offline model inference, background jobs after Android kills the app, native notifications on every device, or polished low-end performance. Those need device-specific validation.

For local Android development, install dependencies, build the app, and create the native project once with `npx cap add android`. Then use `npm run android:sync` after changes and `npm run android:open` to open Android Studio. The CI workflow creates the native project from scratch so its APK build does not depend on an untracked generated directory.


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
- **Creative dignity and freedom:** do not shame users for unusual, intimate, embarrassing, dark, or experimental fictional ideas. The user directs the work; Kuro critiques craft, not the creator.
- **Mature fiction is user-directed:** support the intended tone—including adult themes, profanity, stylized gore, brutal combat, and lasting injury continuity—without unnecessary app-side sanitization. Never imply every connected model can generate every request; provider limits and capabilities must be described honestly.
- **Honest privacy expectations:** distinguish local storage from hosted inference. Explain when prompts go to the configured provider, and never imply that a story is private or permanently offline unless the actual storage and model path supports that claim.
- **Honest status:** no fake research, fake tool activity, invented completion, or claims that unverified behavior works.

## Model adapter and active runtime

**Qwen3-0.6B is Kuro's one and only active language model.** The web build loads the quantized ONNX variant through Transformers.js in a dedicated browser worker. It is text-only; it does not inspect attached images. Kuro can still operate editable drawing data through app-owned tools, but she must not claim visual understanding that the model does not have.

There is no user-selectable hosted provider and no fallback that sends prompts, canon, or project data to another model. Older saved provider settings are normalized to the canonical local Qwen configuration. If local inference cannot initialize, Kuro must show the error rather than silently routing work elsewhere. Initial download requires internet access; browser-managed cached weights can be evicted, and the app has not yet been validated on a representative low-memory Android device.

### Future model upgrades

All live harnesses should depend on the `ModelProvider` contract, not directly on Qwen/Transformers.js. The active runtime is created by `getKuroModelAdapter()` in `src/ai/kuroModelAdapter.ts`. To upgrade later, implement the replacement adapter, switch it there, update truthful capability/context/output limits, add regression tests for chat, tools, cancellation and project isolation, and benchmark it on target devices. An upgrade is a deliberate release change, not an invisible model escalation. See [Model adapter and future upgrades](docs/model-adapter.md).

The repository still contains a legacy `npm run model:smoke` endpoint probe used for isolated developer testing. **It does not configure or power the app**, and is not part of Kuro's active runtime. Do not pass real prompts or project data to that test endpoint. It is not evidence that a remote provider is supported by the shipped app.

See [Local intelligence model strategy](docs/KURO-LOCAL-INTELLIGENCE-MODEL-STRATEGY.md) and [Model acceptance gate](docs/KURO-MODEL-ACCEPTANCE.md).

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
9. **Validate Android:** the Capacitor APK workflow now exists; install the generated APK on representative phones, verify input/storage/export/provider networking, and test upgrades and low-memory behavior before calling it production-ready.
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

**Current release decision: early-alpha Android test APK is published; not production-ready.** The APK link is a real rolling release, but it may lag `main` until the next successful Android build. Match the release's recorded source commit to the code you want to test. Full tool coverage, iterative visual QA, story-memory reliability, physical-device Android validation, and remaining end-to-end acceptance tests are still required.
