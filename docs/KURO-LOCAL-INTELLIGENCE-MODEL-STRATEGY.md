# Kuro Local Intelligence Model Strategy

Status: Qwen3-0.6B is the only active model in the app; the adapter/settings/test path is wired, while live model quality and target-device performance remain unverified, 2026-10-21.

## Selected model: Qwen3-0.6B (quantized ONNX)

**Current and only active model:** `onnx-community/Qwen3-0.6B-DQ-ONNX`, the browser-compatible ONNX Community export of Qwen3-0.6B.

- **Model:** Qwen3-0.6B, approximately 0.6 billion parameters, with a model-card context length of 32,768 tokens.
- **Download target:** approximately **370 MB (estimate)** for the quantized ONNX weight file; tokenizer/config files add a small amount. Actual browser memory use is higher and varies by device.
- **Runtime:** Transformers.js with ONNX Runtime Web, running in the browser. The model is fetched on the user's explicit request and stored in the browser-managed cache.
- **License:** Apache-2.0 for Qwen3-0.6B, according to its official model card. Verify the exact model repository's license and revision before any repackaging/distribution.
- **Capabilities:** text-only instruction following. No image input, and no claim that the base model is already specialized for Kuro's tool schemas.
- **Why this choice:** KuroCanvas is a React/Vite browser app, and this export can run through the existing Transformers.js worker path. Compared with the previous 135M option, Qwen3-0.6B trades a larger first download and higher memory use for a more capable model candidate. FunctionGemma 270M is more directly trained for function calling, but other model formats may require a different inference runtime that is not integrated into this web app. The product decision is one active model—not a user-selectable carousel. Keep Qwen as the sole runtime until a deliberate replacement passes the same acceptance gate on target devices. See [Qwen3-0.6B ONNX model](https://huggingface.co/onnx-community/Qwen3-0.6B-DQ-ONNX), [Qwen3-0.6B model card](https://huggingface.co/Qwen/Qwen3-0.6B), and [FunctionGemma ONNX files](https://huggingface.co/onnx-community/functiongemma-270m-it-ONNX/tree/main/onnx).

This is a **practical integration choice, not a claim that 0.6B parameters can equal a 5B–30B general model**. The initial goal is to make Kuro's browser-local inference path real, then measure tool-plan validity and task success before trusting it with more autonomy. Its language quality and instruction-following may be weak; the harness must validate outputs and fail safely.

### Download and runtime behavior

Model preparation is always an explicit opt-in. The user can choose **Download & prepare Qwen3-0.6B** in Preferences, or send their first chat message and accept the clear preparation confirmation shown before any download begins. The app reports progress and initializes the model before connecting. Sending a message alone must never start a surprise download: declining starts nothing and keeps the draft available, while cancellation or failure must preserve the message for retry. Transformers.js caches the downloaded artifacts in the browser cache. This is not an APK install or permanent file-library download: browser storage can be evicted, so the app may need to fetch the model again later. The first download requires internet; inference runs locally once the files and runtime are available.

The app must never silently download this model on first launch. The download is opt-in, and prompts/story content are not sent to a model provider when using this local provider. This model is text-only: canvas images are not attached to its requests.

### What is integrated—and what is not

- **Implemented in source:** one local browser provider adapter, explicit model preparation with progress, browser-cache-backed inference, request cancellation, Qwen-only settings/catalog, and a text-only capability declaration.
- **Not yet verified:** real model download/inference success on representative low-end Android devices, actual Kuro task quality, long-session memory performance, cached/offline recovery, and physical-device cancellation behavior. Automated tests cover worker cancellation, but they do not replace live model testing.
- **Not included:** fine-tuning on Kuro's native drawing schemas, vision input, a complete iterative visual-QA loop, a bundled model file, or permanent offline guarantees.
- **Important:** browser cache is not a durable model-install directory. If Kuro later ships as a native Android app, evaluate a native on-device runtime and model package separately; do not claim that the web build is equivalent to a native LiteRT integration.

## Harness-first intelligence: the model is one component, not the agent

Kuro's primary design principle is **software-first agency with the smallest model that passes the task benchmarks**. The model proposes interpretations and next actions; Kuro's deterministic runtime owns state, permissions, retrieval, tool schemas, validation, persistence, undo, retries, and evidence. The model is not expected to hold the whole universe in its weights or complete an entire creative task in one generation.

The agent loop should be explicit and bounded:

1. Parse the user's request and identify missing decisions; ask the user when ambiguity affects canon or irreversible work.
2. Retrieve only relevant, universe-scoped records and source evidence.
3. Turn the task into small typed steps with preconditions, expected results, dependencies, and a step/time/token budget.
4. Let the model choose among allowed tools or produce a schema-constrained proposal; validate every argument in ordinary code.
5. Execute only permitted operations, with user approval for meaningful/irreversible changes.
6. Read back actual tool and canvas state; verify postconditions instead of trusting the model's self-report.
7. Retry or repair only within a bounded policy; checkpoint, support cancellation/resume, and explain unresolved failures.

This architecture can make a small model dramatically more useful on structured work, but **a harness cannot guarantee that a 100M-parameter model has the broad reasoning, language, vision, or long-horizon planning ability of a 5B–30B model**. Small models can misunderstand requests, choose wrong tools, produce invalid arguments, and get stuck in loops. Retrieval supplies facts; it does not automatically supply reasoning. Deterministic validators catch defined classes of mistakes; they cannot validate every creative judgement.

Therefore treat **Qwen3-0.6B as a small-model engineering tradeoff, not a promised all-purpose Kuro brain**. Harnesses can make work more reliable by supplying relevant memory, enforcing schemas, validating tools and checking persisted results, but they cannot guarantee nuanced conversation, multi-step creative planning or long-horizon reasoning. Measure task success and failures rather than assuming extra agents or repeated model calls automatically improve quality; extra calls add latency and can amplify errors.

A small open tool-use model has demonstrated that the niche is real, but also that size is not magic: the published TOAM-100M model card reports 22.9% on BFCL v4 Live AST and lower accuracy than FunctionGemma-270M on its cited comparison. This is evidence to benchmark tiny tool controllers—not evidence that a 100M model can replace a much larger general model. See [TOAM-100M model card](https://huggingface.co/ksg91/toam-100m-v0.1).

## Current-device policy and future replacement strategy

Kuro must not require a 27B model—or any multi-tens-of-gigabytes download—to be useful. The current build intentionally has one model, Qwen3-0.6B, across supported web targets. Device assessment must report likely limitations honestly, not switch models or make a new download choice on the user's behalf. Future replacements are deliberate engineering changes, not runtime model tiers. The software harness should carry as much reliability as possible without hiding capability limits or turning every task into a costly chain of model calls.

- **Current build:** Qwen3-0.6B is the one selectable-in-practice model, across supported web targets. If it cannot initialize, preserve manual drawing, reading and Vault access and report the error; do not silently switch models.
- **Future replacement:** a better model may be considered only as a deliberate engineering upgrade to the same adapter contract, with explicit migration, context/capability updates, tests and device benchmarks. It is not exposed as a runtime carousel.
- **All devices:** report readiness estimates as estimates, not guarantees. Keep drawing and saved-project features usable when inference is unavailable.
- **No hosted fallback:** the current application does not offer hosted inference. Do not route private universe content to another model behind the user's back.
- **No model prepared:** keep the app responsive, preserve the user's draft, explain how to prepare Qwen from Preferences, and do not initiate the large download from an ordinary chat message.

These parameter ranges are evaluation targets, not guarantees of memory use or quality. Quantization, runtime format, context length, KV cache, vision encoder, and backend all affect the real footprint. For example, Google's current LiteRT-LM documentation lists a 2.58 GB Gemma 4 E2B model and provides Android CPU/GPU performance measurements on specific modern devices; those figures demonstrate that smaller local paths exist, but they are not evidence that the same latency or memory use will hold on low-end phones. See [LiteRT-LM supported models and measurements](https://developers.google.cn/edge/litert-lm/overview) and the [Android setup guide](https://developers.google.cn/edge/litert-lm/android).

### Required acceptance gates for the current model

1. Keep Qwen3-0.6B's limitations visible; never imply it supports vision or is already fine-tuned for Kuro.
2. Benchmark Qwen on representative low-end Android hardware before calling it production-ready. A model replacement can be considered separately, through a deliberate release-time change.
3. Record download size, peak resident memory, cold-start time, time-to-first-token, tokens/second, battery/thermal behavior, effective context/output limits, and crash rate. Test with the app and canvas open.
4. Test Kuro-specific tasks: multi-turn creative planning, native drawing plans, schema validation, canon retrieval, character continuity, revision-following, uncertainty, and recovery from malformed output.
5. Keep downloads opt-in and cancellable. Show progress and errors, and do not bundle the ~370 MB weights in the web app or APK by default.
6. If the device cannot run Qwen reliably, state that AI features are unavailable in this environment; never make first launch depend on downloading a large checkpoint.

## Kuro is an art agent, not an image generator

Kuro's defining creative path uses the actual native tools in KuroCanvas. She plans, executes, inspects, and revises real editable drawing operations through a typed tool registry shared with the manual UI. A generated bitmap is not the answer to a drawing request. Any optional external generative model is outside the core product definition and must never replace native tool execution.

## Kuro is the product identity, not just a system prompt/

Kuro should consistently introduce herself as Kuro, but identity wording alone is not fine-tuning. Use a layered design:
1. **Kuro behavior specification:** tone, uncertainty, clarifying questions, teaching-by-doing, and no fabricated memory.
2. **Scoped world retrieval:** every retrieved memory, reference, asset, and task must match the active universe ID; include evidence/version identifiers.
3. **Typed creative tools:** inspect project, retrieve canon, create a reference image, propose canvas commands, save to Vault, run checks, and ask for approval. Tool outputs are structured data, not prose pretending an action happened.
4. **Fine-tuning:** begin with LoRA/QLoRA experiments on curated, permissioned examples after the baseline is measured. Train dialogue/briefing, schema-following, canon discipline, revision handling, and tool-use behavior separately where evaluation shows a need. Do not train private user worlds into global weights by default.
5. **Quality gates:** evaluate task success, canon contradictions, identity consistency, schema validity, latency, memory use, and safe recovery. A failed check should trigger a bounded repair or a clear explanation, not a claim of perfection.

## Long sessions and continuity

Do not keep every token of every past session in a single ever-growing prompt. Persist conversation history, maintain a searchable evidence-backed world bible, retrieve only relevant canon for each task, and periodically summarize with links to the underlying source messages. Distinguish:
- confirmed canon,
- user-proposed ideas,
- assistant suggestions,
- unresolved questions,
- superseded/retconned facts,
- facts a character knows versus facts that are objectively true.

The conversation and all derived assets remain within their universe unless the user explicitly copies them elsewhere.

## Image workflow and approvals

1. Clarify the user's vision in ordinary language and summarize it back.
2. Retrieve approved universe references and explain conflicts, missing details, and evidence.
3. Show existing or externally sourced reference images in chat with source attribution, rights/usage notes where known, and links to the associated canon records.
4. If a new visual is requested, create it through supported native canvas tools; an optional image-generation integration must remain separate and must never substitute for the native drawing workflow.
5. Record source URLs, reference IDs, document/model revisions where applicable, and derivation history.
6. Offer clear keep, revise, compare, or discard actions for proposed references and artwork.
7. For canvas changes, produce editable native objects/layers and an actual rollback checkpoint; never represent a flattened generated image as an editable drawing.

## First evaluation suite

Create a permissioned benchmark covering:
- vague or grammatically imperfect briefs;
- extended creative conversations with changing requirements;
- character height/weight/age/outfit consistency;
- location geometry, city layout, factions, power hierarchy, and chronology;
- character knowledge boundaries and retcons;
- image-reference description and visual-difference detection;
- structured tool calls and malformed-output recovery;
- asking useful questions instead of inventing unknown facts;
- response quality in English and Bangla/mixed-language prompts;
- low-memory performance, cancellation, and restart/resume.

**Decision gate:** choose the default model only after local hardware tests and human review against the evaluation suite. A large context number or benchmark rank alone is not sufficient.


## Shipping status: one local model, explicit preparation

The shipped app path uses the local Qwen3-0.6B adapter only. It is not a bundled inference engine and does not include model weights. The browser obtains the quantized ONNX artifacts from the documented model repository when the user explicitly prepares the model. The first successful preparation requires network access; subsequent use may rely on browser-managed cache, which can be evicted. This is not a guarantee of fully offline operation.

The application has a generic ModelProvider contract so a future runtime can be substituted without rewriting Kuro's harnesses. That contract is an internal upgrade seam—not permission to expose other model choices. The active factory rejects remote or alternate-model configuration; no hosted endpoint is active and no prompts/canon are meant to be silently routed elsewhere.

A release must show the current state honestly. Model preparation is opt-in, progress/errors are visible, and cancellation stops the worker. Distinguish:
- **Adapter registered:** the app's Qwen adapter and model descriptor load.
- **Prepared for this session:** model weights and the runtime have loaded in the current worker; this is not guaranteed after a page reload.
- **Cached artifacts:** the browser may retain model files, but storage can be evicted.
- **Offline verified:** preparation, inference, scoped retrieval, and supported tools have been tested without network access on the target device.

## Chat intelligence acceptance gate

Before calling Kuro ready for general use, evaluate multi-turn conversations that span long transcripts and conflicting revisions; test exact recall against source messages; require evidence for canon claims; test graceful uncertainty; compare response quality against a strong baseline using blind human review; and verify that retrieval never leaks across universes. Measure latency and memory on supported desktop and Android devices. Publish the tested Qwen/runtime combinations and known limitations. No single context-window figure or benchmark score substitutes for these gates. Any future model upgrade must pass the same acceptance gate before it becomes the active adapter.
