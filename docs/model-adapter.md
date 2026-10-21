# Kuro model adapter and future upgrades

## Current decision

Kuro currently uses **Qwen3-0.6B as its only first-party model**. The model is an implementation detail behind the ModelProvider contract in `src/ai/modelRegistry.ts`; agent harnesses should call the contract rather than importing Transformers.js, ONNX sessions, Qwen-specific prompts, or model-download details.

## Where a future upgrade goes

1. Implement `ModelProvider` for the new runtime. Keep request/response semantics, cancellation, availability, and honest capability reporting.
2. Change the active adapter created by `getKuroModelAdapter()` in `src/ai/kuroModelAdapter.ts` (or add a small adapter factory there if the runtime needs platform-specific setup).
3. Update the active model constants/metadata in the adapter configuration and its adapter tests.
4. Run `npm run typecheck && npm test && npm run build`, then benchmark the replacement on target Android devices before shipping it.

The drawing executor, research queue, project vault, story memory, continuity rules, and agent harnesses should not need to know which language model is underneath. Keep tool validation and state changes in app code; do not rely on a model to enforce invariants by itself.

## Capability compatibility

A replacement model may have different context limits, structured-output reliability, tool-calling ability, or modalities. Update its declared `ModelDescriptor.capabilities` and add tests for the behaviors Kuro actually uses. A text-only model must not be advertised as vision-capable; requests with unsupported image parts must fail clearly rather than silently discarding them. Keep quality claims tied to repeatable task tests and on-device benchmarks.

## No automatic model escalation

The current product decision is one default model, not silent routing to a stronger model. A future upgrade should be an explicit app-version/runtime change, with migration and regression tests—not an invisible fallback that changes privacy, cost, or personality.
