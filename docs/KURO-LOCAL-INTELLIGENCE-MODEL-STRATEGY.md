# Kuro Local Intelligence Model Strategy

Status: model choice and connection path implemented; local runtime still external, 2026-10-21.

## Desktop/server evaluation candidate: Qwen3.8-27B

**Qwen/Qwen3.8-27B is not Kuro's default model and is not a mobile recommendation.** It is only a high-capability open-weight candidate for desktop/server evaluation. The official model card describes image-plus-text input, agentic/coding improvements, and Apache-2.0 licensing. This is a candidate—not a claim that it is universally best or that its quality matches ChatGPT.

The application now has a dedicated connection preset for `http://localhost:8000/v1` and model ID `Qwen/Qwen3.8-27B`. The existing OpenAI-compatible provider sends Kuro's requests to that endpoint. The preset does not install the model or start the server.

### Run the recommended model locally

On a capable desktop/server with a compatible GPU and enough memory/disk space, follow the current official model card. Its published Transformers weights total about 55.6 GB; actual runtime memory requirements are higher than just the weight file size.

```bash
python -m venv .venv
# Activate the environment for your OS, then:
python -m pip install --upgrade pip
python -m pip install vllm
vllm serve Qwen/Qwen3.8-27B --host 127.0.0.1 --port 8000 --reasoning-parser qwen3
```

The first launch downloads model weights and can take substantial time and bandwidth. Do not run this on a low-memory phone. The full BF16 checkpoint needs more than its on-disk size in runtime memory; the vLLM recipe estimates about 67 GB minimum VRAM for that variant. Official quantized variants exist, including FP8 (about 38 GB minimum VRAM) and hardware-specific NVFP4 (about 32 GB minimum VRAM on supported Blackwell GPUs); use the exact official recipe for your GPU instead of assuming every quantization runs everywhere. See the [official vLLM Qwen3.8 recipe](https://recipes.vllm.ai/Qwen/Qwen3.8-27B) for current hardware and launch requirements.

When the server is ready, open Kuro Canvas → Settings → Connect a model → **Use local Qwen3.8 endpoint** → **Test connection and list models** → choose the returned model ID → **Connect model**. Keep the server running while Kuro uses it.

Official references:
- Model card and runtime instructions: https://huggingface.co/Qwen/Qwen3.8-27B
- Official model-family repository: https://github.com/QwenLM/Qwen3.8

### What is integrated—and what is not

- **Implemented:** model-provider adapter, model discovery, non-streaming chat-completions requests, cancellation signal propagation, endpoint validation, a Qwen3.8 local endpoint preset, and provider adapter tests.
- **Not implemented:** bundled model weights/runtime, automatic model download/installation, verified one-click startup, hardware auto-detection, a measured Kuro benchmark result, or ChatGPT-level parity.
- **Vision integration status:** when the selected model ID/name identifies Qwen3.8-27B, Kuro now rasterizes the current editable canvas to a bounded 1024-pixel JPEG preview and attaches it for drawing requests or explicit visual-inspection requests. Other models do not receive this image automatically. There is not yet a general user-upload/reference-image chat attachment flow or a verified iterative visual-QA loop. Treat this as an initial vision bridge, not complete visual-agent support.
- **Important agent gap:** a chat completion is not the same as reliable native-tool execution. The shared action registry, result read-back, iterative visual QA, rollback and cancellation still need end-to-end closure.

This path makes the model connection real without pretending a 55.6 GB model is bundled into a small web app. Do not direct ordinary Android users to install this model.

## Primary language-and-vision candidate

**Qwen/Qwen3.8-27B** — https://huggingface.co/Qwen/Qwen3.8-27B

Why it is the first candidate to evaluate:
- The published model card identifies it as an open-weight, Apache-2.0 model.
- It accepts image-plus-text input, so Kuro can inspect sketches, references, screenshots, character sheets, and existing canvas previews instead of reasoning from text alone.
- The published repository is 55.6 GB in its listed Transformers format. This is a substantial desktop/server model, not a realistic default download for low-memory Android phones.
- The model card describes improvements to multi-step/long-horizon agentic work. These are promising claims, not proof that it will meet Kuro's creative-quality bar; we must evaluate it against our own tasks.

Do not silently lock this in as the forever winner. Benchmark it against a smaller Qwen3.8 family member and at least one other permissively licensed model on a reproducible Kuro evaluation set. Model versions and licenses must be pinned to exact revisions before packaging or fine-tuning.

## Device-tier strategy (product requirement)

Kuro must not require a 27B model—or any multi-tens-of-gigabytes download—to be useful. Model selection must be based on measured device capability, not one universal default.

- **Low-end Android / memory-constrained devices:** keep the app, native drawing tools, Vault metadata, canon records, and saved history usable without a local LLM. Offer an optional compact on-device model only when the device/runtime combination is supported and benchmarked. Aim to evaluate roughly 0.5B–2B-class models first; do not promise agent reliability or vision capability based on parameter count alone.
- **Capable phones and tablets:** evaluate compact quantized models in roughly the 2B–4B class, with strict limits on RAM, context/KV cache, thermal load, battery use, download size, and latency. Model availability must be checked against actual device capabilities and supported runtime formats.
- **Desktop/laptop:** offer a broader choice of compact local models and larger models where hardware permits, with transparent disk/RAM/VRAM estimates.
- **Hosted model:** offer as an explicit optional path for stronger reasoning/vision when the user has connectivity and accepts the provider's privacy, cost, and data handling. Never silently upload private universe content to a hosted service.
- **No model available:** Kuro should still support manual native drawing, reading/editing saved canon, organizing the Vault, and other deterministic app functions. Clearly disable or label AI-dependent actions rather than pretending they work.

These parameter ranges are evaluation targets, not guarantees of memory use or quality. Quantization, runtime format, context length, KV cache, vision encoder, and backend all affect the real footprint. For example, Google's current LiteRT-LM documentation lists a 2.58 GB Gemma 4 E2B model and provides Android CPU/GPU performance measurements on specific modern devices; those figures demonstrate that smaller local paths exist, but they are not evidence that the same latency or memory use will hold on low-end phones. See [LiteRT-LM supported models and measurements](https://developers.google.cn/edge/litert-lm/overview) and the [Android setup guide](https://developers.google.cn/edge/litert-lm/android).

### Required model-selection gates

1. Keep the 27B preset labelled **desktop/server only**; never call it the default for Android.
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

Do not claim that Kuro has ChatGPT-equivalent intelligence based on the persona prompt or a model name. Conversation quality depends on the selected model, runtime, context construction, retrieval quality, tool integration, and evaluation. The open-weight Qwen3.8-27B model is a desktop/server candidate to benchmark, not a mobile default, completed integration, or guarantee of parity. Its full-precision model files are too large to assume a practical default download on low-memory mobile devices. The product must distinguish:
- **Connected provider:** a configured endpoint answers requests.
- **Installed local model:** weights and compatible runtime are present and pass a smoke test.
- **Bundled model/runtime:** the shipped package contains or installs the explicitly licensed runtime and a documented model acquisition flow.
- **Offline verified:** chat, scoped retrieval, and supported native tools have been tested without network access.

A release must show the current state honestly. Model installation must be opt-in, license-aware, resumable, integrity-checked, disk-space checked, and cancellable. Never download tens of gigabytes silently or block first launch while downloading weights.

## Chat intelligence acceptance gate

Before calling Kuro ready for general use, evaluate multi-turn conversations that span long transcripts and conflicting revisions; test exact recall against source messages; require evidence for canon claims; test image/reference understanding; test graceful uncertainty; compare response quality against a strong baseline using blind human review; and verify that retrieval never leaks across universes. Measure latency and memory on supported desktop and Android devices. Publish the tested model/runtime combinations and known limitations. No single context-window figure or benchmark score substitutes for these gates.
