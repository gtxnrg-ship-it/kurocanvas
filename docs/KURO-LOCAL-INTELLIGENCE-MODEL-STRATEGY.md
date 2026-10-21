# Kuro Local Intelligence Model Strategy

Status: selected browser-local model and download flow under implementation; quality on Kuro tasks remains unverified, 2026-10-21.

## Selected model: Qwen3-0.6B (quantized ONNX)

**Selected model for the next integrated build:** `onnx-community/Qwen3-0.6B-DQ-ONNX`, the browser-compatible ONNX Community export of Qwen3-0.6B.

- **Model:** Qwen3-0.6B, approximately 0.6 billion parameters, with a model-card context length of 32,768 tokens.
- **Download target:** approximately **450 MB (estimate)** for the quantized ONNX weight file; tokenizer/config files add a small amount. Actual browser memory use is higher and varies by device.
- **Runtime:** Transformers.js with ONNX Runtime Web, running in the browser. The model is fetched on the user's explicit request and stored in the browser-managed cache.
- **License:** Apache-2.0 for Qwen3-0.6B, according to its official model card. Verify the exact model repository's license and revision before any repackaging/distribution.
- **Capabilities:** text-only instruction following. No image input, and no claim that the base model is already specialized for Kuro's tool schemas.
- **Why this choice:** the existing KuroCanvas product is a React/Vite browser app, and this is a published browser-ready ONNX export around the user's desired 100 MB scale. FunctionGemma 270M is more directly trained for function calling, but the published ONNX export currently totals about 2.94 GB; its smaller GGUF builds require a different inference runtime that is not integrated into this web app. For this first end-to-end build, the browser-ready 137 MB model is the more practical choice. See [SmolLM2 browser ONNX model](https://huggingface.co/onnx-community/Qwen3-0.6B-DQ-ONNX), [SmolLM2 model card](https://huggingface.co/Qwen/Qwen3-0.6B), and [FunctionGemma ONNX files](https://huggingface.co/onnx-community/functiongemma-270m-it-ONNX/tree/main/onnx).

This is a **practical integration choice, not a claim that 135M parameters can equal a 5B–30B general model**. The initial goal is to make Kuro's browser-local inference path real, then measure tool-plan validity and task success before trusting it with more autonomy. Its language quality and instruction-following may be weak; the harness must validate outputs and fail safely.

### Download and runtime behavior

In Preferences, the user explicitly chooses **Download ~137 MB model & connect**. The app reports download progress and initializes the model before connecting. Transformers.js caches the downloaded artifacts in the browser cache. This is not an APK install or permanent file-library download: browser storage can be evicted, so the app may need to fetch the model again later. The first download requires internet; inference runs locally once the files and runtime are available.

The app must never silently download this model on first launch. The download is opt-in, and prompts/story content are not sent to a model provider when using this local provider. This model is text-only: canvas images are not attached to its requests.

### What is integrated—and what is not

- **Being implemented:** local browser provider, one-click model preparation with progress, cached local inference, model-provider routing, text-only capability declaration, and removal of the oversized Qwen preset.
- **Not yet verified:** successful model download in the deployed app, inference on representative low-end Android devices, actual Kuro task success, long-session memory performance, and robust cancellation during an in-progress ONNX generation.
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

Therefore treat **~100M parameters as an experiment for narrow controller tasks**, not a promised all-purpose Kuro brain. Test it for intent routing, tool selection among a small menu, schema filling, and concise status decisions. Evaluate a stronger compact model for nuanced conversation, multi-step creative planning, canon conflict resolution, and visual reasoning. A single model may handle more than one role only if it passes the same gates. Do not assume multiple agents or repeated model calls improve quality; extra calls also add latency and can amplify errors.

A small open tool-use model has demonstrated that the niche is real, but also that size is not magic: the published TOAM-100M model card reports 22.9% on BFCL v4 Live AST and lower accuracy than FunctionGemma-270M on its cited comparison. This is evidence to benchmark tiny tool controllers—not evidence that a 100M model can replace a much larger general model. See [TOAM-100M model card](https://huggingface.co/ksg91/toam-100m-v0.1).

## Device-tier strategy (product requirement)

Kuro must not require a 27B model—or any multi-tens-of-gigabytes download—to be useful. Model selection must be based on measured device capability, not one universal default. The software harness should carry as much reliability as possible without hiding capability limits or turning every task into a costly chain of model calls.

- **Low-end Android / memory-constrained devices:** keep the app, native drawing tools, Vault metadata, canon records, and saved history usable without a local LLM. Offer an optional compact on-device model only when the device/runtime combination is supported and benchmarked. Aim to evaluate roughly 0.5B–2B-class models first; do not promise agent reliability or vision capability based on parameter count alone.
- **Capable phones and tablets:** evaluate compact quantized models in roughly the 2B–4B class, with strict limits on RAM, context/KV cache, thermal load, battery use, download size, and latency. Model availability must be checked against actual device capabilities and supported runtime formats.
- **Desktop/laptop:** offer a broader choice of compact local models and larger models where hardware permits, with transparent disk/RAM/VRAM estimates.
- **Hosted model:** offer as an explicit optional path for stronger reasoning/vision when the user has connectivity and accepts the provider's privacy, cost, and data handling. Never silently upload private universe content to a hosted service.
- **No model available:** Kuro should still support manual native drawing, reading/editing saved canon, organizing the Vault, and other deterministic app functions. Clearly disable or label AI-dependent actions rather than pretending they work.

These parameter ranges are evaluation targets, not guarantees of memory use or quality. Quantization, runtime format, context length, KV cache, vision encoder, and backend all affect the real footprint. For example, Google's current LiteRT-LM documentation lists a 2.58 GB Gemma 4 E2B model and provides Android CPU/GPU performance measurements on specific modern devices; those figures demonstrate that smaller local paths exist, but they are not evidence that the same latency or memory use will hold on low-end phones. See [LiteRT-LM supported models and measurements](https://developers.google.cn/edge/litert-lm/overview) and the [Android setup guide](https://developers.google.cn/edge/litert-lm/android).

### Required model-selection gates

1. Keep the selected 135M model's limitations visible; never imply it supports vision or is already fine-tuned for Kuro.
2. Benchmark at least one compact text model and one compact vision-capable candidate on representative low-end Android hardware before selecting a mobile default.
3. Record model download size, peak resident memory, cold-start time, time-to-first-token, tokens/second, battery/thermal behavior, context limit, and crash rate. Test with the app and canvas open, not in an isolated benchmark only.
4. Test Kuro-specific tasks: multi-turn creative planning, strict structured tool calls, canon retrieval, character continuity, revision-following, uncertainty, and recovery from malformed output. A model that chats well but cannot reliably use drawing tools must not be presented as a complete art agent.
5. Make model downloads opt-in, resumable, cancellable, integrity-checked, and preceded by storage/network estimates. Do not bundle multi-gigabyte weights in the web app or APK by default.
6. If the device cannot run a model reliably, offer a smaller model or an explicit hosted/desktop option; never make first launch depend on downloading a large checkpoint.

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


## Shipping status: model weights and runtime are not bundled

The current application has a compatible-provider connection layer and model capability/selection contracts. This is not a bundled inference engine, does not include model weights, and does not provide a turnkey offline model on first launch. A configured local endpoint means the user or operator has separately installed and started a compatible inference server.

Do not claim that Kuro has ChatGPT-equivalent intelligence based on the persona prompt or a model name. Conversation quality depends on the selected model, runtime, context construction, retrieval quality, tool integration, and evaluation. The selected SmolLM2-135M model is a compact browser-local baseline, not a guarantee of parity with larger models. Its task quality must be measured before release. The product must distinguish:
- **Connected provider:** a configured endpoint answers requests.
- **Installed local model:** weights and compatible runtime are present and pass a smoke test.
- **Bundled model/runtime:** the shipped package contains or installs the explicitly licensed runtime and a documented model acquisition flow.
- **Offline verified:** chat, scoped retrieval, and supported native tools have been tested without network access.

A release must show the current state honestly. Model installation must be opt-in, license-aware, resumable, integrity-checked, disk-space checked, and cancellable. Never download tens of gigabytes silently or block first launch while downloading weights.

## Chat intelligence acceptance gate

Before calling Kuro ready for general use, evaluate multi-turn conversations that span long transcripts and conflicting revisions; test exact recall against source messages; require evidence for canon claims; test image/reference understanding; test graceful uncertainty; compare response quality against a strong baseline using blind human review; and verify that retrieval never leaks across universes. Measure latency and memory on supported desktop and Android devices. Publish the tested model/runtime combinations and known limitations. No single context-window figure or benchmark score substitutes for these gates.
