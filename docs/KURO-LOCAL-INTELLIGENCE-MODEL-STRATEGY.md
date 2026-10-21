# Kuro Local Intelligence Model Strategy

Status: candidate selection and implementation contract, 2026-10-21. This document records a testable direction, not a claim that a model is already integrated or fine-tuned.

## Primary language-and-vision candidate

**Qwen/Qwen3.8-27B** — https://huggingface.co/Qwen/Qwen3.8-27B

Why it is the first candidate to evaluate:
- The published model card identifies it as an open-weight, Apache-2.0 model.
- It accepts image-plus-text input, so Kuro can inspect sketches, references, screenshots, character sheets, and existing canvas previews instead of reasoning from text alone.
- The published repository is 55.6 GB in its listed Transformers format. This is a substantial desktop/server model, not a realistic default download for low-memory Android phones.
- The model card describes improvements to multi-step/long-horizon agentic work. These are promising claims, not proof that it will meet Kuro's creative-quality bar; we must evaluate it against our own tasks.

Do not silently lock this in as the forever winner. Benchmark it against a smaller Qwen3.8 family member and at least one other permissively licensed model on a reproducible Kuro evaluation set. Model versions and licenses must be pinned to exact revisions before packaging or fine-tuning.

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
2. Retrieve approved universe references and explain any conflicts or missing details.
3. Generate one or more previews using the local image model where supported.
4. Show the generated preview directly in chat and save a versioned copy in the Vault.
5. Record model/revision, prompt, reference IDs, and derivation history.
6. Offer clear keep, revise, compare, or discard actions.
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
