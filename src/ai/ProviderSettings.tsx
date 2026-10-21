import { useRef, useState } from "react";
import ModelAdvisor from "./ModelAdvisor";
import { createConfiguredProvider, isLocalTinyModelPrepared, LOCAL_TINY_BASE_URL, LOCAL_TINY_MODEL_URI, prepareLocalTinyModel } from "./providerFactory";
import type { ModelDescriptor } from "./modelRegistry";
import type { KuroVoiceIntensity } from "./kuroPersona";
import { getKuroVoiceGuidance, KURO_PERSONA_CORE } from "./kuroPersona";
import { createLocalModelBenchmark, loadLocalModelBenchmark, localBenchmarkRatingLabel, saveLocalModelBenchmark, type LocalModelBenchmark } from "./modelBenchmark";
import { KURO_TINY_MODEL_DESCRIPTOR_ID } from "./localTinyModelConfig";

export interface ActiveProviderConfig {
  /** Kept as a compatibility shape for saved settings; Kuro currently accepts only the local model. */
  baseUrl: string;
  modelUri: string;
  apiKey?: string;
  allowInsecureLocalhost: boolean;
  supportsVision?: boolean;
}

interface ProviderSettingsProps {
  initialBaseUrl: string;
  initialModelUri: string;
  initialSupportsVision?: boolean;
  voiceIntensity: KuroVoiceIntensity;
  onVoiceIntensityChange: (intensity: KuroVoiceIntensity) => void;
  onSave: (config: ActiveProviderConfig) => void;
  onClose: () => void;
}

const canonicalConfig: ActiveProviderConfig = {
  baseUrl: LOCAL_TINY_BASE_URL,
  modelUri: LOCAL_TINY_MODEL_URI,
  allowInsecureLocalhost: false,
  supportsVision: false,
};

export default function ProviderSettings({ voiceIntensity, onVoiceIntensityChange, onSave, onClose }: ProviderSettingsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voicePreview, setVoicePreview] = useState("");
  const [modelProgress, setModelProgress] = useState(0);
  const [localModelPrepared, setLocalModelPrepared] = useState(() => isLocalTinyModelPrepared());
  const [localModelPreparing, setLocalModelPreparing] = useState(false);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const localModelAbortController = useRef<AbortController | undefined>(undefined);
  const [localBenchmark, setLocalBenchmark] = useState<LocalModelBenchmark | undefined>(
    () => loadLocalModelBenchmark(KURO_TINY_MODEL_DESCRIPTOR_ID),
  );

  async function checkModelAdapter() {
    setBusy(true);
    setError("");
    setStatus("Checking the local Qwen adapter…");
    try {
      const provider = createConfiguredProvider(canonicalConfig);
      const found = await provider.listModels();
      const qwen = found.filter(model => model.id === KURO_TINY_MODEL_DESCRIPTOR_ID);
      if (qwen.length !== 1) throw new Error("Kuro expected exactly one Qwen3-0.6B model descriptor but did not find it.");
      setModels(qwen);
      const prepared = isLocalTinyModelPrepared();
      setLocalModelPrepared(prepared);
      setStatus(prepared
        ? "Qwen3-0.6B is already prepared in this session."
        : "The adapter is connected, but model weights are not loaded. Use “Download & prepare Qwen3-0.6B” before chatting; this check does not download the model.");
      onSave(canonicalConfig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Kuro's local model adapter.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAndConnectLocalModel() {
    const controller = new AbortController();
    localModelAbortController.current = controller;
    setLocalModelPreparing(true);
    setBusy(true);
    setError("");
    setStatus("Preparing Qwen3-0.6B on this device…");
    setModelProgress(0);
    try {
      const found = await prepareLocalTinyModel(progress => {
        setModelProgress(progress.percent);
        setStatus(progress.status + (progress.percent > 0 ? " · " + progress.percent + "%" : ""));
      }, controller.signal);
      if (controller.signal.aborted) throw new Error("Local model preparation cancelled.");
      const qwen = found.filter(model => model.id === KURO_TINY_MODEL_DESCRIPTOR_ID);
      if (qwen.length !== 1) throw new Error("The prepared adapter did not return exactly one Qwen3-0.6B model.");
      setModels(qwen);
      setLocalModelPrepared(true);
      onSave(canonicalConfig);
      setStatus("Qwen3-0.6B is prepared for this session. Kuro's model requests remain on-device; after a page reload, prepare it again from the browser cache.");
    } catch (e) {
      if (controller.signal.aborted) {
        setStatus("Model preparation cancelled. Your projects and canvas remain available; prepare Qwen again when ready.");
        setError("");
      } else {
        setError(e instanceof Error ? e.message : "Could not download or initialize Qwen3-0.6B.");
      }
    } finally {
      if (localModelAbortController.current === controller) localModelAbortController.current = undefined;
      setLocalModelPreparing(false);
      setBusy(false);
    }
  }

  function cancelLocalModelPreparation() {
    const controller = localModelAbortController.current;
    if (!controller || controller.signal.aborted) return;
    setStatus("Cancelling model preparation…");
    controller.abort();
  }

  async function benchmarkLocalModel() {
    setBusy(true);
    setError("");
    setStatus("Warming up local inference before the measured run…");
    try {
      const provider = createConfiguredProvider(canonicalConfig);
      const model = (await provider.listModels()).find(item => item.id === KURO_TINY_MODEL_DESCRIPTOR_ID);
      if (!model) throw new Error("Qwen3-0.6B is not registered with the local adapter.");
      await provider.generate({
        role: "fast-helper",
        messages: [{ role: "user", content: "Reply with one short greeting." }],
        temperature: 0,
        maxOutputTokens: 16,
      }, model);
      setStatus("Measuring local generation speed…");
      const started = performance.now();
      const response = await provider.generate({
        role: "fast-helper",
        messages: [{ role: "user", content: "Write exactly two useful sentences for a new manga creator. Be clear, specific, and encouraging. Do not stop after a greeting." }],
        temperature: 0,
        maxOutputTokens: 64,
      }, model);
      const elapsedMs = performance.now() - started;
      if (response.finishReason === "cancelled" || response.finishReason === "error") {
        throw new Error("The local benchmark did not complete.");
      }
      const result = createLocalModelBenchmark(model.id, response.usage?.outputTokens ?? 0, elapsedMs);
      setLocalBenchmark(result);
      saveLocalModelBenchmark(result);
      setStatus(localBenchmarkRatingLabel(result.rating) + " · " + result.tokensPerSecond.toFixed(1) + " output tokens/s · " + result.elapsedMs + " ms for " + result.outputTokens + " tokens. This is a speed check, not a measure of story or drawing quality.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The on-device speed benchmark failed.");
    } finally {
      setBusy(false);
    }
  }

  async function previewVoice() {
    const selected = models.find(model => model.id === KURO_TINY_MODEL_DESCRIPTOR_ID);
    if (!selected) {
      setError("Prepare Qwen3-0.6B before previewing Kuro's voice. Checking the adapter alone does not load model weights.");
      return;
    }
    setVoiceTesting(true);
    setError("");
    setVoicePreview("");
    try {
      const provider = createConfiguredProvider(canonicalConfig);
      const response = await provider.generate({
        role: "reasoning",
        messages: [
          { role: "system", content: KURO_PERSONA_CORE + "\n\n" + getKuroVoiceGuidance(voiceIntensity) },
          { role: "user", content: "Reply naturally to a manga creator who feels overwhelmed and does not know where to start drawing a scene. Be playfully tsundere if it fits, then offer one useful first step. Keep it to 2–4 sentences." },
        ],
        temperature: 0.75,
        maxOutputTokens: 220,
      }, selected);
      setVoicePreview(response.text.trim() || "The model returned an empty reply. Try again after checking model preparation.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kuro's voice preview failed.");
    } finally {
      setVoiceTesting(false);
    }
  }

  function save() {
    onSave(canonicalConfig);
    setStatus("Saved: Qwen3-0.6B · on-device · text-only.");
    onClose();
  }

  return <section className="provider-settings" role="dialog" aria-modal="true" aria-labelledby="provider-settings-title">
    <div className="provider-settings-head">
      <div>
        <small>LOCAL MODEL · SINGLE ADAPTER</small>
        <h2 id="provider-settings-title">Kuro's intelligence</h2>
        <p>Kuro currently runs one model: Qwen3-0.6B on your device. Her drawing, memory, canon, research, and workflow harnesses are app features—not separate models.</p>
      </div>
      <button onClick={onClose} aria-label="Close settings">×</button>
    </div>
    <ModelAdvisor benchmark={localBenchmark} />
    <div className="provider-recommended-model">
      <strong>Qwen3-0.6B · the only active model</strong>
      <p>The quantized ONNX weights are approximately 370 MB. Download and model initialization happen only when you explicitly choose “Download & prepare Qwen3-0.6B”; a normal chat message will not trigger a download. Transformers.js caches files in this browser, but browser storage may be evicted. Runtime memory is higher than download size and varies by device. Qwen is text-only: Kuro uses editable canvas/document data and validated native drawing tools rather than pretending the model can see images.</p>
      <div className="provider-actions">
        <button type="button" onClick={checkModelAdapter} disabled={busy}>{busy ? "Checking…" : "Check local adapter"}</button>
        <button type="button" onClick={downloadAndConnectLocalModel} disabled={busy}>{localModelPreparing ? "Preparing… " + modelProgress + "%" : localModelPrepared ? "Prepare model again" : "Download & prepare Qwen3-0.6B"}</button>
        {localModelPreparing && <button type="button" className="provider-secondary" onClick={cancelLocalModelPreparation}>Cancel preparation</button>}
      </div>
      <button type="button" className="provider-secondary" onClick={benchmarkLocalModel} disabled={busy || !localModelPrepared}>{busy ? "Working…" : "Benchmark generation speed"}</button>
      <p className="provider-muted">Speed is measured on this device after a warm-up; it does not measure writing quality, tool reliability, or canvas performance. A page reload clears the live model session, so prepare Qwen again before benchmarking or using voice preview.</p>
      <a href="https://huggingface.co/onnx-community/Qwen3-0.6B-DQ-ONNX" target="_blank" rel="noreferrer">Model files and license ↗</a>
    </div>
    <fieldset className="kuro-voice-settings">
      <legend>Kuro's personality</legend>
      <label>Tsundere intensity<select value={voiceIntensity} onChange={e => onVoiceIntensityChange(e.target.value as KuroVoiceIntensity)}>
        <option value="subtle">Subtle · dry wit, gentle warmth</option>
        <option value="playful">Balanced · playful teasing</option>
        <option value="expressive">Expressive · dramatic anime energy</option>
      </select></label>
      <p>Her personality stays natural and context-aware. When you're genuinely upset or discussing something serious, she puts the teasing aside.</p>
      <button type="button" className="provider-secondary" onClick={previewVoice} disabled={voiceTesting || !localModelPrepared}>{voiceTesting ? "Trying her voice…" : "Preview Kuro's voice"}</button>
      {voicePreview && <blockquote className="kuro-voice-preview" aria-live="polite">{voicePreview}</blockquote>}
    </fieldset>
    {status && <p className="provider-status" role="status">{status}</p>}
    {error && <p className="provider-error" role="alert">{error}</p>}
    <p className="provider-warning">No hosted provider or API key is configured by this screen, and no remote model fallback is used. If local inference is unavailable, Kuro reports the problem rather than sending your prompts or project data elsewhere. Image understanding is not supported by Qwen3-0.6B here.</p>
    <div className="provider-actions">
      <button className="provider-secondary" onClick={onClose}>Close</button>
      <button onClick={save}>Use Qwen3-0.6B</button>
    </div>
  </section>;
}
