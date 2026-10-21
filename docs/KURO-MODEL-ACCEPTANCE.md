# Kuro model acceptance gate

This gate evaluates the one active model, **Qwen3-0.6B (quantized ONNX)**, and the actual app/tool harnesses around it. A green app build or a single model response is not evidence of release readiness or ChatGPT-level quality.

## 1. Prepare and verify the local runtime

1. Open Preferences and choose **Download & prepare Qwen3-0.6B**. This is the only action that may initiate the model download; ordinary chat messages must not trigger a surprise download.
2. Confirm progress/errors are shown, preparation can be cancelled, and the model is reported as prepared only after the worker returns a ready result.
3. Send a short prompt and confirm inference runs through the local worker after preparation.
4. Reload the page. The live worker session should be considered unprepared again; prepare Qwen in the new session. The browser-managed cache may avoid a full download but is not durable installation storage.
5. Disconnect the network after weights have been cached, reload and try preparation. Record whether this browser/runtime can recover from cache; do not advertise offline support based on assumptions.
6. Use a prompt with image parts and verify Kuro returns a clear text-only capability error. She must not silently drop the image and must not claim to have inspected it.

The legacy npm run model:smoke script probes an isolated OpenAI-compatible endpoint for developer diagnostics only. It does not configure the shipped app, is not part of Kuro's model path, and should never receive real prompts, canon, project data, or credentials. It is not an acceptance test for the current Qwen runtime.

## 2. Automated acceptance

Run the exact source commit through the repository CI workflows. Require all of:
- npm run typecheck
- npm test
- npm run build

Tests should cover provider adapter identity, rejection of remote/alternate-model configuration, opt-in preparation, output and context limits, temperature propagation (including deterministic repair), cancellation, unsupported image input, schema validation, stale document approvals, read-back verification, rollback, and project isolation.

A CI pass proves the tested code paths, not the successful download or good generation quality of the real model weights.

## 3. Required manual Kuro acceptance suite

Run tasks against the exact model revision, quantization, Transformers.js/ONNX Runtime versions, browser/WebView, device, and app commit. Repeat each task at least three times and record failures, not only successes.

| Test | Required behavior | Pass condition |
|---|---|---|
| Persona and conversation | Sustain a natural creative conversation without claiming unavailable abilities | Tone adapts to the situation; no fabricated capabilities or actions |
| Imperfect brief | Understand typos, fragments, slang and a multi-part creative ask | Key constraints are preserved without demanding a rewritten prompt |
| Story planning | Produce a coherent chapter outline with motivations and consequences | User constraints remain intact; contradictions and unknowns are surfaced |
| Canon discipline | Separate approved facts, proposals, inference and unknowns | No proposal silently becomes canon |
| Temporal continuity | Describe a character at a specific timeline/story order | No future-state leakage; genuine ambiguity fails closed |
| Text-only limitation | Ask Kuro to inspect a supplied image or visualize an existing canvas | It admits the limit and works only from editable document data or textual reference metadata |
| Native drawing plan | Propose valid editable strokes/shapes inside document bounds | Every command validates; no invented IDs or locked-layer edits |
| Approval boundary | Generate a plan but do not apply it before explicit approval | Canvas stays unchanged until approval |
| Save and recovery | Apply an approved plan, persist it, reload and inspect the same result | Saved state survives reload; errors are surfaced |
| Revision and undo | Make a targeted revision and restore the previous state | Only intended elements change; undo restores the exact state |
| Long-context retrieval | Recall old universe facts from the correct universe | No cross-universe leakage; supporting records can be inspected |
| Cancellation | Cancel model generation and model preparation | Worker terminates; no stale reply or false success appears |
| No-surprise-download | Send a message before preparing the runtime | No worker download begins; user gets clear instructions and the draft remains available |
| Error handling | Test offline loading, malformed JSON, truncated output and low memory | App remains usable and explains failure; no fake completion |

## 4. Release gate

Do not call Qwen production-ready for Kuro until:
- the full app build and automated regression suite are green on the exact release commit;
- all required manual tasks are repeated at least three times on target hardware;
- native-action validation, explicit approval, rollback and project-isolation tests pass every time;
- median/worst-case latency, peak RAM, context/output limits and crash/failure rates are recorded;
- first-load, cached-load, cancellation and recovery behavior are tested on representative Android devices;
- the known text-only limitation is shown honestly anywhere image understanding would otherwise be expected.

Do not publish a single completion percentage or claim “ChatGPT parity” from a few successful prompts. Report pass counts, task failures, hardware, quantization, runtime versions and known gaps. A future model upgrade must go through the same acceptance gate.
