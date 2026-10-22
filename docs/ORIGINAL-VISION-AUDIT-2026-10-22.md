# KuroCanvas Original-Vision and End-to-End Audit
**Audit date:** 22 October 2026  
**Baseline:** `main` at `b4e0c632cc08522cfe71c1e1e80f5a3178ac6e63`  
**Scope:** Source-level review of the primary app flow, model preparation, navigation, canvas preview, character hand-off, voice integration, product specification, roadmap and CI.

This is an evidence-backed audit snapshot, not a claim that every possible defect in every code path has been reproduced. The repository cannot be executed on a real browser or Android device from this review environment. Automated CI on the original baseline was green, but passing typechecks/unit tests/builds is not proof that the product journey works end to end.

**Update as of 22 October 2026:** the chat-first/navigation and recovery changes have merged through [PR #153](https://github.com/gtxnrg-ship-it/kurocanvas/pull/153), voice/dictation improvements through [PR #154](https://github.com/gtxnrg-ship-it/kurocanvas/pull/154), and the proposed character-design-to-World-&-Vault hand-off through [PR #155](https://github.com/gtxnrg-ship-it/kurocanvas/pull/155). At code SHA `c924d39fe67b3847b86eaa0d9aac8b7cb60f0556`, Project checks and Kuro Canvas checks passed with 70 test files / 531 tests, TypeScript, and Vite production build. The Android APK build was still running at the time of this note. None of these checks substitutes for the real-device and end-to-end release acceptance below.

## The intended ordinary-user journey

1. Open Kuro and either continue an existing world or start one. The user should not have to understand projects, providers, canvases, memory databases or tool plans.
2. Talk naturally with Kuro to brainstorm the premise, genre, characters, setting, chronology, tone and how the story should unfold. The draft and conversation remain safe if model preparation fails or is cancelled.
3. Kuro researches when requested, shows usable sources and uncertainty, and keeps sourced facts separate from fictional suggestions.
4. Together, the user and Kuro approve the world rules, characters and visual direction. Proposed details do not silently become canon.
5. When the user asks to begin visuals, Kuro moves into a visible creation stage: native editable canvas actions happen incrementally, the user sees real progress, can pause/revise/undo, and can approve character/location designs into the active world and reusable vault.
6. Once the user is ready, Kuro uses the approved world and visual references to outline and draft the story with continuity, then creates panels/assets through the same reviewable workflow.
7. The project restores after a restart and can be exported without silently losing supported work.

**Acceptance principle:** chat is the front door and orchestration surface. Specialist views are available when useful, but the user should not have to manually orchestrate the application.

## Findings and changes merged into current main

| Priority | Finding | Evidence and impact | Action on current main |
|---|---|---|---|
| P1 usability/spec alignment | **A “New chat” label obscured universe isolation.** | The architecture contract says independent creative worlds must be isolated, while another conversation in an existing world is a separate explicit action. A generic “New chat” label made scope unclear. | The sidebar now says “New universe” and always creates an isolated universe. The chat header separately offers “New conversation” inside the active universe. |
| P1 usability | **The first ordinary chat request stopped at a Preferences detour.** | `send()` previously rejected an unprepared model and required the user to open Preferences and resend. | Main now offers the explicit model-preparation consent when the user first sends, shows preparation progress and retries that same prompt after success. Composer, tools and microphone are locked during preparation so edits cannot be silently lost; declining or failure preserves the draft. The consent is repeated on a later attempt if preparation still has not succeeded. |
| P1 state handling | **Live Creation could enter “planning” before the model gate rejected the request.** | In `send()`, the live session log/status was updated before the unprepared-model return. That could leave a running-looking session with no running operation. | Moved the Live Creation state transition after the model-preparation gate, so rejected/cancelled first-run setup does not create a false working entry. |
| P1 usability | **The home hero presented four competing starting actions.** | “New universe”, “Live creation studio”, “Open drawing studio” and “Research & browse” encouraged the user to choose an implementation mode before talking to Kuro. | Replaced the hero actions with one “Talk to Kuro” action. It resumes the active conversation when available and creates the first universe only when necessary. |
| P1 usability | **All specialist destinations competed at the same sidebar level.** | Home, chat, live creation, canvas, reader, research and vault appeared as seven peer destinations. That conflicts with the chat-first promise. | Grouped Live Creation, canvas, reader and research under a collapsible “Creative tools” section, leaving Home, Talk to Kuro and World & Vault as the primary destinations. The group opens when a specialist view is reached through another route. |
| P2 copy accuracy | **The chat side panel called itself “LIVE WORKSPACE” while showing a saved-document preview.** | `WorkspacePreview.tsx` loads the persisted drawing and regenerates an SVG after storage-change notifications. Its own notice accurately says it is saved artwork, not a live 3D viewport; the panel title was more suggestive than the implementation. | Renamed the panel to “SAVED CANVAS PREVIEW”. The dedicated Live Creation canvas remains the place to watch actual drawing actions. |
| P1 orchestration | **A visual request from chat did not itself enter Live Creation.** | `send()` treated requests as live only when the user had already navigated to the Live Creation view. An ordinary character-design conversation could require the user to understand and open the specialist mode manually. | Added a conservative intent matcher for explicit canvas requests and visual deliverables (character sheets, storyboards, panels, maps, portraits, and similar work). It switches to Live Creation only for a clear visual-production request; ordinary brainstorming and research remain in chat. Added unit tests for both paths. |

Current status: the original chat-first fixes are in main through PR #153. Subsequent main changes expand natural visual-request routing through PR #156, protect character-revision chronology through PR #157, and fix chapter-vs-story-order filtering plus JSON download timing through PR #158. At current source SHA `434464344e7f5017dd3899a11cc677828804af0f`, both CI workflows and preview build passed; Project checks recorded 71 test files / 541 tests, TypeScript and production build succeeded. The latest-source Android APK build was still running. Automated success is not proof of hands-on device acceptance.

## Important gaps against the original vision

### P0 — One coherent creation journey is not yet demonstrated

The code has distinct Home, Chat, Live Creation, Drawing Canvas, Reader, Research Lab and Creative Vault views. Main now routes explicit canvas/artifact requests from Chat into Live Creation. PR #156 added direct “draw her” style and broader character-look requests; PR #158 extended this to natural appearance edits such as outfit/hair/scar changes, while preserving negation and keeping personality/worldbuilding discussions in chat. That still does **not** prove the entire brainstorm → research → approved world → character design → live native drawing → save character to world/vault → story outline/draft workflow end to end.

A browser-level acceptance test must prove this path from a fresh install and a returning project. In particular, verify when the user asks “make this character now” that Kuro can initiate a real creation session from the conversation, show incremental editable work, and offer clear approval into the correct project's character/world records. Do not assume this works merely because the individual studio components exist.

### P0 — Character art capability must be described and tested honestly

The active Qwen3-0.6B model is text-only; it does not inspect canvas pixels as a vision model would. The drawing engine can execute supported native strokes, shapes, layers and other typed actions, but the roadmap itself says it is not yet a professional drawing application or autonomous production artist. Procedural 3D models are blockouts, not fully sculpted/rigged/animated characters.

Therefore, “Kuro creates polished, consistent character sheets and finished manga artwork autonomously” is **not established** by current evidence. The release journey should demonstrate a useful incremental character-design workflow, visible editing, character continuity, and an honest fallback when the native toolset cannot produce the requested detail. A text-only model must not claim to have visually inspected or corrected an artwork result it did not inspect.

### P1 — Research is a useful foundation, not yet the broad research assistant in the vision

The queue currently includes Wikipedia extracts and Crossref scholarly metadata/DOI links. The roadmap notes this is not full-text research, comprehensive primary-source discovery or automatic fact verification. The normal flow still needs authoritative-source discovery, source quality/uncertainty presentation, citation verification, cancellation/retry UX, and an explicit approval step before research becomes canon.

### P1 — Live creation progress and recovery need an end-to-end proof

The audit branch now stores each Live Creation session under a project-scoped localStorage key and validates the saved record on restore. An interrupted `planning` or `drawing` session is restored as paused with a clear recovery note rather than being presented as completed. This closes the React-state-only session-log loss, but **the in-flight validated drawing plan/canvas request is not itself durably queued**; after a hard reload during a batch, the user must inspect the saved canvas and resume/reissue the remaining work. Browser-level reload, project-switch and cancellation tests still need to prove the saved timeline and drawing remain consistent.

The current session also has a bounded batch count. Verify that hitting the limit produces a clear “paused for review / continue” state rather than making the user believe the entire request is finished.

### P1 — Character-to-world handoff has implementation; end-to-end continuity is still unverified

The merged PR #155 adds a post-creation **Save design** action. It links the saved drawing to a proposed story-memory visual reference, adds a proposed character entity for a new character, and adds a proposed visual state to the active project's style bible. It supports a new appearance for an existing character without replacing that character's approved identity. The handoff asks for creator-confirmed appearance details, protects project scope, blocks duplicate drawing links, and attempts rollback if the three storage writes fail partway. These entries are proposals, never auto-approved canon.

This removes the manual asset-linking gap in source, but doesn't prove that approved details are consistently retrieved during chapter writing. PR #157 also prevents an existing character's later visual version from silently defaulting to story order zero. PR #158 adds integration tests that check proposals stay out of writing context until approved and that later visual states do not leak into earlier chapters. Browser/Android acceptance must still verify World & Vault shows the record, approval state persists after reload, the linked drawing opens, retcon/revision works, and a subsequent chapter uses the approved name, age, outfit, scars, injuries and timeline state.

### P1 — The “simple on a phone” requirement is still a device acceptance task

Mobile CSS intentionally makes the canvas non-interactive in the compact companion layout, which fits the stated chat-and-vault mobile intent; it must still show creation results legibly and never imply that the phone's disabled canvas is editable. The full tablet/desktop studio must remain usable. Check small-screen keyboard overlap, safe areas, text scaling, touch target size, focus order, screen-reader names, reduced motion, orientation, large response scrolling and workspace switching on actual devices.

### P1 — Voice is not ready to be called integrated until hardware checks pass

Voice profile/accent and speech-input reliability improvements are merged through [PR #154](https://github.com/gtxnrg-ship-it/kurocanvas/pull/154) and passed both automated workflows before merge. Older voice PRs #151 and #152 were closed as superseded by current main; their stale app/settings snapshots must not be merged over the integrated voice path. Fish Audio requires the user's own API key/network and receives spoken reply text; browser speech recognition may process audio off-device. The selected voice profiles share one Kuro personality, and accent choices are prompt-level directions, not guaranteed acoustic results. Physical Android checks for consent, key handling, English intelligibility, interruption, permissions, background/resume and audio playback are still required.

### P1 — Project portability and failure recovery remain release blockers

The roadmap identifies incomplete coverage for binary reference assets, unlinked drawings, full archive round-trip, corrupted/oversized packages, interrupted saves, active research tasks, multi-tab deletion and real-browser storage failure. These are potential data-loss issues until the round trips are exercised. Verify autosave/reload, switching/deleting projects, export/import of all linked assets, backup recovery, and unsupported or damaged archives before claiming a project is portable.

### P2 — Exact-source verification is updated; device acceptance remains open

The roadmap is now refreshed to current source SHA `434464344e7f5017dd3899a11cc677828804af0f` using exact-main CI links. Project checks record 71 passing test files / 541 passing tests, TypeScript and Vite production build passing, and the preview build passing. The APK workflow for that SHA was still running when updated. Keep source-level implementation, automated tests, APK provenance, public deployment and physical-device verification as separate statuses.

## Baseline checks observed

After PR #158, current application source `main` was `434464344e7f5017dd3899a11cc677828804af0f`. Exact-source [Project checks](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39768338824), [Kuro Canvas checks](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39768338871), and [development-preview build](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39768338798) passed; Project checks recorded 71 test files / 541 tests passed, TypeScript passed and Vite build succeeded. The [Android APK workflow](https://github.com/gtxnrg-ship-it/kurocanvas/actions/runs/39768338797) was still running when this status was written. These are automation results, not proof of real-device usability, full creative journey, voice quality, or autonomous art quality.

## Required release acceptance run

Do not declare the original vision complete until these exact-user-flow checks pass on the final source SHA:

1. **Fresh start:** tap “Talk to Kuro”, approve the first local-model preparation, see real progress, and send the original message without retyping. Decline/cancel/fail safely and preserve the draft.
2. **Scope clarity:** “New universe” creates a new isolated world; “New conversation” creates another transcript inside the current world. Switching universes isolates messages, canon, drawings and research.
3. **Brainstorm and research:** discuss a premise naturally, ask for research, inspect source URLs/excerpts and uncertainty, approve only selected facts into canon.
4. **Character to world:** after brainstorming in Chat, ask “create this character on the canvas” or “make me a character sheet”; confirm Kuro enters Live Creation without manually opening the tools menu, produces incremental native edits with per-step status, pauses/revises/undoes correctly, saves the completed design from the Live Creation handoff, approves the proposed character/appearance records in World & Vault, reloads, and confirms the linked drawing and approved visual state are used in a subsequent chapter.
5. **Writing:** ask for an outline and first chapter; the output uses approved canon and preserves aliases, age/timeline, look, outfit, scars, injuries, character knowledge, and prior chapter state.
6. **Recovery:** reload or background the app during a long task; resume or accurately explain what was interrupted; verify saved drawings/canon/messages are intact.
7. **Visual and platform:** inspect the real production build at phone/tablet/desktop sizes, test keyboard/safe areas/accessibility, then install and smoke-test the exact APK on a physical Android device.
8. **Final provenance:** record the final commit SHA, passing typecheck/test/build runs, APK workflow/release checksum, and remaining limitations.

Any failure above is a real release blocker, not a future-polish item. Keep the UI simple: one primary conversation, visible progress when Kuro works, plain-language review/approval, and specialist tools only when needed.

## Additional source-review findings from PR #153

### P1 — First-run model preparation can overwrite edits made while downloading

In the first-run path in `src/App.tsx`, `send()` captures the submitted text before awaiting `prepareLocalTinyModel()`. The initial implementation left the composer editable during that await, so it could send the older captured text and clear newer edits. **Fix merged to main:** the composer, attach/tools control and microphone are disabled during model preparation, and the tools popover is closed before the download starts. The copy no longer implies that the consent prompt itself is one-time. Exact-commit TypeScript, tests and production build passed; direct Android preparation/cancel/retry behavior still needs device verification.

### P2 — The “one-time-per-session” consent description does not match the implementation

The code invokes `window.confirm(...)` on every send while the model is unprepared. If the user declines and retries, the prompt appears again; there is no session-scoped decision state. **Current main behavior:** the prompt asks whether to start preparing the model without claiming the confirmation itself is one-time. This is intentionally repeated per attempt; declining starts no download. The main branch's exact-SHA automated checks pass, but device-level preparation/cancellation/retry still needs a hands-on acceptance run.



### P2 — Removed an unimplemented keyboard shortcut hint

The sidebar’s “New universe” control showed `⌘ K` even though the app had no matching keyboard handler. The hint is removed rather than teaching a shortcut that does nothing. Keyboard navigation and focus behavior still belong in the browser accessibility acceptance run.

### Resolved in the audit branch — universe and conversation labels now match the architecture contract

The sidebar control is labelled **New universe** and always creates a distinct isolated universe. The chat header’s **New conversation** action creates another transcript inside the currently active universe and shares only that universe’s approved canon by explicit action. This keeps the boundary visible in the interface and agrees with `docs/UNIVERSE-ARCHITECTURE-AND-UI.md`. Regression tests must still prove that a fresh universe cannot retrieve another universe’s canon, messages, drawings or research.

### Required regression coverage

- First-run consent accepted, declined, cancelled, failed, and retried.
- Editing the composer during model preparation does not silently discard the edit.
- The submitted message is retried exactly once after preparation succeeds.
- “New story/world” and “New conversation” have distinct, tested data-scope behavior.
- A natural-language character design request results in an actual supported native drawing plan, not only intent-regex success or navigation to a workspace.
