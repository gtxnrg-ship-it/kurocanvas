# Kuro Canvas Master Roadmap

Kuro is a **tool-using creative agent**, not a generative-image chatbot. Her model plans work; the app's native drawing and project tools must perform the work on editable documents. This board is the current engineering truth source for finishing and handing the project to its creators.

## How to read this board

- **Code present** means relevant source exists; it does not mean the full user journey works.
- **Test added** means a regression test exists; do not call it verified until the test actually runs and passes.
- **Verified** requires a passing reproducible check or an explicitly recorded hands-on test.
- **Blocked** means required infrastructure or a device/provider is unavailable.

Never mark a feature complete because its component, type, or README description exists. Never claim research, drawing, saving, rollback, APK creation, or testing unless there is evidence that the action happened.

## Current verification snapshot

Last verified evidence reviewed: **21 October 2026**.

- Main branch at this snapshot: [`9df9182bf2ee`](https://github.com/gtxnrg-ship-it/kurocanvas/commit/9df9182bf2eec3926ee91f7267aa1bca20fae30e). This revision adds a Crossref scholarly-metadata research provider, cross-tab queue coordination, safer task completion, and source-accurate notifications. CI for this exact revision was still running when this snapshot was edited.
- The last fully observed green acceptance run was [`617719e0bc22`](https://github.com/gtxnrg-ship-it/kurocanvas/commit/617719e0bc22697425a4028debcc423aa7a3818b): the locked-dependency typecheck/test/production-build sequence passed, and the Android workflow assembled and published a debug APK. See the exact [web checks](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39625544173), [project checks](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39625544470), and [Android build](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39625544224). These results apply to that SHA, not automatically to newer commits.
- A real [rolling Android test APK release](https://github.com/gtxnrg-ship-it/kurocanvas/releases/tag/android-dev-latest) exists. It is debug-signed and not production-ready; its release notes and asset digest identify the binary. Physical-device installation and smoke testing remain unverified.
- The same acceptance sequence now runs in CI using the committed lockfile. It must pass again on the exact current SHA [`9df9182bf2ee`](https://github.com/gtxnrg-ship-it/kurocanvas/commit/9df9182bf2eec3926ee91f7267aa1bca20fae30e) before the latest research changes count as verified.
- GitHub Pages source build and tests passed in the last inspected deployment run, but deployment stopped at `actions/configure-pages` with a 404 because the repository's Pages site is not enabled/configured. This is a repository-setting blocker, not a TypeScript failure.
- The tracked `package-lock.json` is installed with the pinned npm version using `npm ci` in the permanent web and Android workflows; the last observed green runs confirm locked installation on SHA `617719e0bc22`.

## Existing implementation foundations — not blanket completion claims

| Area | Source-level foundation present | Remaining proof or gap |
|---|---|---|
| App and navigation | React + TypeScript + Vite; chat, canvas, reader, research, Vault and settings areas | Full journeys, touch navigation, accessibility and mobile layout still need execution checks |
| Model providers | OpenAI-compatible endpoint configuration/discovery, request deadlines, cancellation and bounded response parsing | No real hosted/local endpoint has been validated in this handoff; streaming and provider-specific compatibility vary |
| Local model | Browser worker, WASM inference, cache use, progress, cancellation and a text-only small-model path | Downloads weights on demand; not a fully bundled/offline model; text-only and tightly output-bounded; real Android speed/quality unknown |
| Response harness | Request-aware answer depth, creator-friendly persona, explicit limits and no-fabricated-success rules | Prompt quality is not a guarantee of model reasoning, output length, consistency or provider policy |
| Conversation context | Bounded, relevance-ranked turn selection plus separate durable project records | Retrieval misses, context selection quality and very-long-series performance require adversarial regression tests; no literal unlimited context |
| World and canon | World Bible, art direction/style Bible, project-scoped references, story memory, relationships and character evolution | Search/edit/revision UX, contradictions/retcons, evidence coverage and scale remain incomplete |
| Temporal story continuity | Chapter/story coordinates, approved states, reveal filtering, memory relevance ranking and recall guards | Needs end-to-end tests across early/late chapters, alternate timelines, out-of-order scenes and full-series planning |
| Native drawing | Editable strokes, primitives, layers, transforms, validation, approval preview, save/read-back verification and rollback foundations | Not yet a professional drawing application or autonomous production artist; command coverage and iterative visual QA remain limited |
| 3D character references | Procedural character blockout, camera and trait/state foundations | Not a complete sculpting, modeling, rigging, retargeting or animation editor |
| Research queue | Persistent tasks, progress/state, cancellation, Wikipedia extracts, Crossref bibliographic metadata/DOI links, bounded abstract excerpts, cross-tab leases and source-aware notifications | Crossref is metadata discovery, not full-text search, a literature review, primary-source discovery or automatic fact verification |
| Project packages | Versioned `.kuro.json`, drawing/revision serialization, project data import/export and research-history transfer | Size limit, asset coverage and cross-database recovery need more tests; unlinked legacy canvases and some binary references are not included |
| Project lifecycle | Scoped project deletion, research-task cleanup, and compensation if primary deletion fails; unit tests cover lifecycle ordering and recovery | Active-task/multi-tab deletion and real-browser storage-failure recovery still need hands-on testing |
| Android | A rolling debug-signed test APK is published from a successful workflow: [download APK](https://github.com/gtxnrg-ship-it/kurocanvas/releases/download/android-dev-latest/kuro-canvas-debug.apk) · [release provenance](https://github.com/gtxnrg-ship-it/kurocanvas/releases/tag/android-dev-latest) | The verified binary at the last green run corresponds to SHA `617719e0bc22`; physical-device install, permissions, offline behavior, memory use and low-end-phone performance remain unverified |
| Deployment | GitHub Actions build/deploy workflows and a documented preview URL | Actions runner startup and Pages availability are unresolved until successful workflow evidence appears |

## Release blockers — finish in this order

### P0 — Restore a reproducible verification path

- [x] Re-run source CI with real hosted runners and capture actual test/build output; earlier runner-less failures were superseded by successful runs on later exact SHAs.
- [x] Generate and commit `package-lock.json` from the same Node/npm/peer-dependency policy used in CI; remove the temporary bootstrap workflow.
- [x] Switch the permanent web and Android CI workflows to the committed lockfile with `npm ci`; successful runs on SHA `617719e0bc22` confirm locked installation.
- [ ] Confirm the exact-main acceptance sequence passes on the latest SHA `9df9182bf2ee` (Actions runs are in progress).
- [ ] Run `npm run typecheck && npm test && npm run build` on the actual latest `main` SHA after the lockfile/CI change; resolve every real failure before handoff.
- [x] Build and publish a debug-signed APK with a SHA-256 digest and source-commit provenance.
- [ ] Install and launch the published APK on a real Android device and record the device/OS smoke-test outcome.
- [ ] Record the exact source SHA, workflow run, test results and APK checksum; do not use an old artifact as evidence for newer code.
- [ ] Confirm Pages deployment independently of the build job, or mark hosted preview unavailable.

### P1 — Complete native drawing as a trustworthy agent workflow

- [ ] Inventory each visible canvas operation and decide whether Kuro can call it through a validated native action schema. Unsupported actions must be explained, not pretended.
- [ ] Add an inspectable action timeline with per-action status, selected-step retry, pause/resume/cancel, provenance, checkpoints, and grouped undo/rollback.
- [ ] Ensure approval is bound to the exact document, layer, and plan shown in the preview; reject stale approvals after the document changes.
- [ ] Close coverage gaps for layer create/rename/reorder, selections, masks/blending, reference/image placement, lettering and comic-panel operations where the editor supports them.
- [ ] Add viewport pan/zoom coordinate transforms, pressure/coalesced input, touch/stylus and large-document performance tests.
- [ ] Add a drawing loop in which Kuro inspects the *actual* rendered/editable result, identifies visible defects, revises selected regions, and stops honestly when its tools cannot complete the request.
- [ ] Test corrupt storage, interrupted saves, switching active drawings, locked/hidden layers, rollback and read-back mismatch. Never report success based only on model text.

### P1 — Make writing and world memory dependable at series scale

- [ ] Build an integrated series → arc → chapter → scene → panel planning pipeline, with review gates, versioned drafts and user-approved canon.
- [ ] Keep author-only full outlines and intentional out-of-order work available while applying reader-facing reveal gates only to sequential production.
- [ ] Expand character/location/prop identity resolution; ask when multiple candidates are genuinely ambiguous.
- [ ] Track world truth separately from character knowledge, belief, suspicion and what the character has been told.
- [ ] Add linked provenance, contradiction handling, proposed/approved/superseded states and explicit retcon impact for downstream scenes, panels and assets.
- [ ] Add searchable/inspectable/editable memory controls and retrieval tests with misleading near-matches, old injuries, aliases, timelines and large entity sets.
- [ ] Keep transcript context bounded; improve durable summaries and retrieval instead of claiming infinite context or placing the entire world bible in every prompt.
- [ ] Test reuse of stable character/location assets, injuries healing over time, persistent scars, costume/location/relationship changes, clues, cameos and planned payoffs across long chronology.

### P1 — Preserve every project and its data safely

- [ ] Run package import/export round trips with all supported assets, large projects, duplicate IDs, malformed JSON, unsupported schemas and interrupted transactions.
- [ ] Decide and document how reference-image binaries, unlinked drawings, imported model blobs and other external assets travel; never silently drop linked assets.
- [ ] Test project deletion and failed recovery across the main IndexedDB and research queue database, including an actively running task and multiple tabs.
- [ ] Ensure project switching/deletion clears stale UI state, stops relevant work and cannot leak one project's memory into another.
- [ ] Define backup/restore and migration recovery before changing IndexedDB schemas. Keep schema migrations backwards-aware and observable.

### P1 — Make research useful beyond a single source index

- [ ] Add a pluggable research provider layer instead of assuming Wikipedia is sufficient for all questions.
- [ ] Prefer authoritative primary sources, archives, museums, scholarly papers and official documentation when appropriate; preserve source URL, publication/author metadata when available, exact excerpt and collection date.
- [ ] Label factual claims, uncertainty, conflicting sources, inference and fictional suggestions separately.
- [ ] Verify citations and source relevance; do not treat snippets or a completed queue status as proof that every claim is settled.
- [ ] Provide queue prioritization, visible progress/errors, retry/cancel controls, background execution limits and notification fallbacks on Android/WebView.
- [ ] Require the author's approval before research findings become story canon.

### P1 — Finish Android distribution and device quality

- [x] Publish a debug APK only after the locked acceptance sequence and Gradle assembly pass; label debug signing and release provenance clearly.
- [ ] Re-publish and verify the APK for the latest SHA after its in-progress Android workflow finishes.
- [ ] Test startup, chat without a provider, local drawing offline, IndexedDB migrations, resume/recovery, notifications, orientation, keyboard/safe areas and file import/export on-device.
- [ ] Profile memory, GPU/3D resource disposal, canvas responsiveness and long sessions on a low-resource Android phone.
- [ ] Audit external requests, provider credential handling, imported packages, service-worker caches and any stored creative/private data.
- [ ] Add accessibility passes for focus order, keyboard operation, touch target size, contrast, screen readers and reduced motion.

### P2 — Complete manga/manhua/Webtoon production

- [ ] Shared series/chapter/scene/panel document model with editable panel order, reading direction, gutters and page/strip dimensions.
- [ ] Native panel composition and lettering workflow: dialogue, speech bubbles/tails, narration, sound effects and typography controls.
- [ ] Virtualized long vertical strips, chapter navigation and stable per-panel revisions.
- [ ] Export verified image sequences, long-strip splits, PDF and CBZ with correct order/dimensions; preserve all relevant source artwork.
- [ ] Make templates and reusable character/location/prop assets searchable, versioned, attributable and safe to revise.

### P2 — Complete the visual reference studio

- [ ] Separate canonical character design from project art direction; save approved invariants and distinguish candidate variations.
- [ ] Finish 3D pose/camera/light/reference scene saving and 2D capture. Label procedural blockouts as blockouts rather than finished models.
- [ ] Provide low-resource rendering fallback and consistently dispose of GPU resources, loaded model data and object URLs.

## Acceptance criteria for a handoff labelled “finished”

Kuro is not release-ready until all of the following are evidenced:

1. A clean, reproducible install, passing type/build checks and passing automated regressions on the final source commit.
2. A real downloadable APK built from that commit, installed and smoke-tested on Android.
3. End-to-end proof that native drawing changes editable state, persists, can be inspected, and can be recovered/undone accurately.
4. Project isolation and import/export/deletion tests showing no silent loss, cross-project leakage or false success states.
5. Story-continuity tests proving sequential reveal gating coexists with author-directed full-series planning.
6. Clear documentation of current provider, model, research, storage, privacy and device limitations.
7. No unresolved critical data-loss/security issues, and no release claims based on a workflow that did not actually execute.

The target is the complete creator tool described in `docs/PRODUCT-SPEC.md`, not simply a compiling chat UI. Keep improving and verifying coherent slices; never convert an unimplemented item to “done” just to produce a 100% number.
