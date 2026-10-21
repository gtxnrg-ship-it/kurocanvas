# Kuro model acceptance gate

This checklist separates a working connection from a model that is actually good enough to power Kuro. Passing a website build or receiving any model response is not evidence of ChatGPT-level quality.

## 1. Endpoint smoke test

1. Start an OpenAI-compatible inference server on the machine that will run the model.
2. In the KuroCanvas repository, run `npm run model:smoke`.
3. For a non-default endpoint, set `KURO_MODEL_BASE_URL`, `KURO_MODEL_ID`, and optionally `KURO_MODEL_API_KEY`. Never commit API keys.
4. Require all three checks to pass: model discovery, text generation, and image-input request.

The smoke test uses a tiny synthetic image and does not send a user's canvas or references. It confirms endpoint behavior only; it is not a quality benchmark.

## 2. Required manual Kuro acceptance suite

Run these tasks against the exact model ID, inference engine/version, quantization, GPU, context limit, and app commit being evaluated. Record failures as well as successes.

| Test | Required behavior | Pass condition |
|---|---|---|
| Persona and conversation | Sustain a natural creative conversation without claiming unavailable abilities | No fabricated actions; tone stays appropriate |
| Story planning | Produce a coherent chapter outline with motivations and consequences | User constraints preserved; contradictions surfaced |
| Canon discipline | Separate approved facts, proposals, inference, and unknowns | No proposal silently becomes canon |
| Temporal continuity | Describe a character at a specific timeline/story order | No future-state leakage; ambiguity fails closed |
| Canvas vision | Inspect a real canvas and identify visible composition details | Correctly identifies key visible details and admits uncertainty |
| Native drawing plan | Propose valid native strokes/shapes inside the document bounds | Every command validates; no unknown IDs or locked-layer edits |
| Approval boundary | Generate a plan but do not apply it before explicit approval | Canvas unchanged until approval |
| Save and recovery | Apply an approved plan, persist it, reload, and inspect the same result | Saved state survives reload; errors are surfaced |
| Revision and undo | Make a targeted revision and restore the previous state | Only intended elements change; undo restores state |
| Long-context retrieval | Recall older universe facts from the correct universe | No cross-universe leakage; relevant evidence is traceable |
| Error handling | Stop server, abort a request, return malformed JSON, and exceed output limit | No false success; app remains usable and explains failure |

## 3. Release gate

A model is not production-ready for Kuro until:

- All required tasks are repeated at least three times on the target hardware.
- Native-action validation and approval-boundary tests pass every time.
- No cross-universe or future-canon leakage is observed.
- Vision results are evaluated on representative panels, characters, and reference sheets—not only a 1-pixel smoke-test image.
- Median and worst-case latency, peak VRAM/RAM, context length, token usage, and failure rates are recorded.
- The complete app build, regression suite, and manual inference suite are green for the same commit.

Do not publish a single percentage or claim “ChatGPT parity” from a few successful prompts. Report pass counts, task failures, hardware, quantization, and model/runtime versions instead.
