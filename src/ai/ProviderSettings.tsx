import { useEffect, useRef, useState } from "react";
import ModelAdvisor from "./ModelAdvisor";
import { createConfiguredProvider, isLocalTinyModelPrepared, LOCAL_TINY_BASE_URL, LOCAL_TINY_MODEL_URI, prepareLocalTinyModel } from "./providerFactory";
import type { ModelDescriptor } from "./modelRegistry";
import { getKuroVoiceGuidance, KURO_PERSONA_CORE } from "./kuroPersona";
import { createLocalModelBenchmark, loadLocalModelBenchmark, localBenchmarkRatingLabel, saveLocalModelBenchmark, type LocalModelBenchmark } from "./modelBenchmark";
import { KURO_TINY_MODEL_DESCRIPTOR_ID } from "./localTinyModelConfig";
import { KURO_FISH_VOICES, KURO_SPEECH_MODEL_ID, KURO_SPEECH_VOICES, prepareKuroVoice, readKuroSpeechPreferences, saveKuroSpeechPreferences, speakKuroVoice, type KuroSpeechEngine, type KuroSpeechPreferences } from "./kuroSpeech";

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
  onSave: (config: ActiveProviderConfig) => void;
  onClose: () => void;
}

const canonicalConfig: ActiveProviderConfig = {
  baseUrl: LOCAL_TINY_BASE_URL,
  modelUri: LOCAL_TINY_MODEL_URI,
  allowInsecureLocalhost: false,
  supportsVision: false,
};

export default function ProviderSettings({ onSave, onClose }: ProviderSettingsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voicePreview, setVoicePreview] = useState("");
  const [speechPreferences,setSpeechPreferences] = useState<KuroSpeechPreferences>(()=>readKuroSpeechPreferences());
  const [speechPreparing,setSpeechPreparing] = useState(false);
  const [speechProgress,setSpeechProgress] = useState(0);
  const [speechStatus,setSpeechStatus] = useState("");
  const [modelProgress, setModelProgress] = useState(0);
  const [localModelPrepared, setLocalModelPrepared] = useState(() => isLocalTinyModelPrepared());
  const [localModelPreparing, setLocalModelPreparing] = useState(false);
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const localModelAbortController = useRef<AbortController | undefined>(undefined);
  const inferenceAbortController = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => {
    localModelAbortController.current?.abort();
    inferenceAbortController.current?.abort();
  }, []);

  function closeSettings() {
    localModelAbortController.current?.abort();
    inferenceAbortController.current?.abort();
    onClose();
  }
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
      if (controller.signal.aborted) setLocalModelPrepared(false);
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
    const controller = new AbortController();
    inferenceAbortController.current = controller;
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
        signal: controller.signal,
      }, model);
      setStatus("Measuring local generation speed…");
      const started = performance.now();
      const response = await provider.generate({
        role: "fast-helper",
        messages: [{ role: "user", content: "Write exactly two useful sentences for a new manga creator. Be clear, specific, and encouraging. Do not stop after a greeting." }],
        temperature: 0,
        maxOutputTokens: 64,
        signal: controller.signal,
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
      if (controller.signal.aborted) setStatus("Speed benchmark cancelled.");
      else setError(e instanceof Error ? e.message : "The on-device speed benchmark failed.");
    } finally {
      if (controller.signal.aborted) setLocalModelPrepared(false);
      if (inferenceAbortController.current === controller) inferenceAbortController.current = undefined;
      setBusy(false);
    }
  }

  async function previewVoice() {
    const selected = models.find(model => model.id === KURO_TINY_MODEL_DESCRIPTOR_ID);
    if (!selected) {
      setError("Prepare Qwen3-0.6B before previewing Kuro's voice. Checking the adapter alone does not load model weights.");
      return;
    }
    const controller = new AbortController();
    inferenceAbortController.current = controller;
    setVoiceTesting(true);
    setError("");
    setVoicePreview("");
    try {
      const provider = createConfiguredProvider(canonicalConfig);
      const response = await provider.generate({
        role: "reasoning",
        messages: [
          { role: "system", content: KURO_PERSONA_CORE + "\n\n" + getKuroVoiceGuidance() },
          { role: "user", content: "Reply naturally to a manga creator who feels overwhelmed and does not know where to start drawing a scene. Be playfully tsundere if it fits, then offer one useful first step. Keep it to 2–4 sentences." },
        ],
        temperature: 0.75,
        maxOutputTokens: 220,
        signal: controller.signal,
      }, selected);
      const preview=response.text.trim();
      setVoicePreview(preview || "The model returned an empty reply. Try again after checking model preparation.");
      if(preview){
        setSpeechStatus(speechPreferences.engine==="kokoro"?"Preparing Kuro's local Kokoro voice…":"Using the device's speech voice…");
        try{
          await speakKuroVoice(preview,speechPreferences,progress=>{
            setSpeechProgress(progress.percent);
            setSpeechStatus(progress.status+(progress.percent>0?" · "+progress.percent+"%":""));
          });
          setSpeechStatus("Voice preview finished.");
        }catch(voiceError){
          setSpeechStatus("Text preview succeeded, but speech playback failed: "+(voiceError instanceof Error?voiceError.message:"unknown voice error"));
        }
      }
    } catch (e) {
      if (controller.signal.aborted) setStatus("Kuro's voice preview was cancelled.");
      else setError(e instanceof Error ? e.message : "Kuro's voice preview failed.");
    } finally {
      if (controller.signal.aborted) setLocalModelPrepared(false);
      if (inferenceAbortController.current === controller) inferenceAbortController.current = undefined;
      setVoiceTesting(false);
    }
  }

  async function previewSelectedVoice(){
    setSpeechPreparing(true);setSpeechProgress(0);setSpeechStatus("Preparing a short voice test…");
    try{
      await speakKuroVoice(
        "Hey… it's Kuro. Okay, let's think this through together. I have a few ideas, and we can take them one step at a time.",
        speechPreferences,
        progress=>{setSpeechProgress(progress.percent);setSpeechStatus(progress.status+(progress.percent>0?" · "+progress.percent+"%":""));},
      );
      setSpeechStatus("Voice test finished.");
    }catch(error){
      setSpeechStatus("Voice test failed: "+(error instanceof Error?error.message:"unknown voice error"));
    }finally{setSpeechPreparing(false);}
  }

  async function prepareSpeechEngine(){
    setSpeechPreparing(true);setSpeechProgress(0);setError("");
    try{
      if(speechPreferences.engine==="kokoro"){
        setSpeechStatus("Preparing the local Kokoro model · first use needs a download…");
        await prepareKuroVoice(progress=>{setSpeechProgress(progress.percent);setSpeechStatus(progress.status+(progress.percent>0?" · "+progress.percent+"%":""));});
        setSpeechStatus("Kokoro Local is prepared in this session. Browser cache may preserve files for later use.");
      }else if(speechPreferences.engine==="fish"){
        if(!speechPreferences.apiKey.trim())throw new Error("Add your own Fish Audio API key below. The key has not been validated until a real voice request succeeds.");
        setSpeechStatus("Fish Audio is configured. This check does not send text or spend generation credits; use “Test selected voice” to verify the key and voice.");
      }else{
        if(!("speechSynthesis" in window))throw new Error("This device does not expose speech synthesis.");
        setSpeechStatus("Device speech synthesis is available. Voice quality and voice choices depend on the operating system.");
      }
    }catch(error){setSpeechStatus("Voice setup failed: "+(error instanceof Error?error.message:"unknown error"));}
    finally{setSpeechPreparing(false);}
  }
  function updateSpeechPreferences(next:KuroSpeechPreferences){
    setSpeechPreferences(next);saveKuroSpeechPreferences(next);setSpeechStatus("");
  }
  function save() {
    onSave(canonicalConfig);
    setStatus("Saved: Qwen3-0.6B · on-device · text-only.");
    closeSettings();
  }

  return <section className="provider-settings" role="dialog" aria-modal="true" aria-labelledby="provider-settings-title">
    <div className="provider-settings-head">
      <div>
        <small>LOCAL MODEL · SINGLE ADAPTER</small>
        <h2 id="provider-settings-title">Kuro's intelligence</h2>
        <p>Kuro currently runs one model: Qwen3-0.6B on your device. Her drawing, memory, canon, research, and workflow harnesses are app features—not separate models.</p>
      </div>
      <button onClick={closeSettings} aria-label="Close settings">×</button>
    </div>
    <ModelAdvisor benchmark={localBenchmark} />
    <div className="provider-recommended-model">
      <strong>Qwen3-0.6B · the only active model</strong>
      <p>The quantized ONNX weights are approximately 370 MB. Download and model initialization happen only when you explicitly choose “Download & prepare Qwen3-0.6B”; a normal chat message will not trigger a download. Transformers.js caches files in this browser, but browser storage may be evicted. Runtime memory is higher than download size and varies by device. Qwen is text-only: Kuro uses editable canvas/document data and validated native drawing tools rather than pretending the model can see images.</p>
      <div className="provider-actions">
        <button type="button" onClick={checkModelAdapter} disabled={busy || voiceTesting}>{busy ? "Checking…" : "Check local adapter"}</button>
        <button type="button" onClick={downloadAndConnectLocalModel} disabled={busy || voiceTesting}>{localModelPreparing ? "Preparing… " + modelProgress + "%" : localModelPrepared ? "Prepare model again" : "Download & prepare Qwen3-0.6B"}</button>
        {localModelPreparing && <button type="button" className="provider-secondary" onClick={cancelLocalModelPreparation}>Cancel preparation</button>}
      </div>
      <button type="button" className="provider-secondary" onClick={benchmarkLocalModel} disabled={busy || voiceTesting || !localModelPrepared}>{busy ? "Working…" : "Benchmark generation speed"}</button>
      <p className="provider-muted">Speed is measured on this device after a warm-up; it does not measure writing quality, tool reliability, or canvas performance. A page reload clears the live model session, so prepare Qwen again before benchmarking or using voice preview.</p>
      <a href="https://huggingface.co/onnx-community/Qwen3-0.6B-DQ-ONNX" target="_blank" rel="noreferrer">Model files and license ↗</a>
    </div>
    <fieldset className="kuro-speech-settings">
      <legend>Spoken voice · audio output</legend>
      <label>Speech engine<select value={speechPreferences.engine} onChange={event=>{
        const engine=event.target.value as KuroSpeechEngine;
        const voice=engine==="fish"?KURO_FISH_VOICES[0].id:engine==="kokoro"?"af_bella":speechPreferences.voice;
        updateSpeechPreferences({...speechPreferences,engine,voice});
      }}>
        <option value="fish">Fish Audio Drama 3 · Sakura / Chiaki / Mitsuri</option>
        <option value="kokoro">Kokoro Local · private, on-device neural speech</option>
        <option value="system">Device voice · system speech synthesis</option>
      </select></label>
      {speechPreferences.engine==="fish"&&<>
        <label>Kuro's voice<select value={speechPreferences.voice} onChange={event=>updateSpeechPreferences({...speechPreferences,voice:event.target.value})}>
          {KURO_FISH_VOICES.map(voice=><option value={voice.id} key={voice.id}>{voice.label}</option>)}
        </select></label>
        <label>Fish Audio API key<input type="password" autoComplete="off" spellCheck={false} value={speechPreferences.apiKey} onChange={event=>updateSpeechPreferences({...speechPreferences,apiKey:event.target.value})} placeholder="Paste your Fish Audio API key"/></label>
        <p>Voice audio is generated by Fish Audio, not on this device. Spoken text and your API key go to Fish Audio; Kuro's chat model and project memory stay on the local-model path. The key is stored in this browser's local storage (not encrypted). Drama 3 API usage may be billed by Fish Audio, so check pricing before enabling automatic voice replies. <a href="https://fish.audio/developers/" target="_blank" rel="noreferrer">Get an API key</a> · <a href="https://fish.audio/pricing/" target="_blank" rel="noreferrer">Check pricing</a>.</p>
        <p className="speech-model-links">Listen to the <a href={KURO_FISH_VOICES[0].sampleUrl} target="_blank" rel="noreferrer">SAKURA sample</a>, <a href={KURO_FISH_VOICES[1].sampleUrl} target="_blank" rel="noreferrer">Chiaki sample</a>, or <a href={KURO_FISH_VOICES[2].sampleUrl} target="_blank" rel="noreferrer">Mitsuri sample</a>.</p>
      </>}
      {speechPreferences.engine==="kokoro"&&<label>Kuro's voice<select value={speechPreferences.voice} onChange={event=>updateSpeechPreferences({...speechPreferences,voice:event.target.value})}>
        {KURO_SPEECH_VOICES.map(voice=><option value={voice.id} key={voice.id}>{voice.label}</option>)}
      </select></label>}
      <label>Speaking pace <span>{speechPreferences.rate.toFixed(2)}×</span><input type="range" min="0.8" max="1.2" step="0.05" value={speechPreferences.rate} onChange={event=>updateSpeechPreferences({...speechPreferences,rate:Number(event.target.value)})}/></label>
      <p>{speechPreferences.engine==="fish"?"Fish Audio's multilingual speech engine applies the chosen profile to English text. The voice's accent and expressiveness can vary on English; test all three profiles with your own sample and choose the one you prefer.":speechPreferences.engine==="kokoro"?"Kokoro is an open-source, quantized local speech model. First use downloads its voice weights; later availability depends on the browser cache and device memory. Its included voices are not Japanese-accented.":"The device voice uses the operating system's speech engine. Available voices, realism, network needs and languages vary by Android/browser."}</p>
      {speechPreferences.engine==="kokoro"&&<small className="speech-model-id">Model: {KURO_SPEECH_MODEL_ID} · Apache-2.0 · quantized ONNX</small>}
      <div className="speech-actions">
        <button type="button" className="provider-secondary" onClick={()=>void prepareSpeechEngine()} disabled={speechPreparing||voiceTesting}>{speechPreparing?"Preparing voice · "+speechProgress+"%":speechPreferences.engine==="kokoro"?"Prepare local Kokoro voice":speechPreferences.engine==="fish"?"Check Fish Audio setup":"Check device voice"}</button>
        <button type="button" className="provider-secondary" onClick={()=>void previewSelectedVoice()} disabled={speechPreparing||voiceTesting}>Test selected voice</button>
      </div>
      {speechStatus&&<p className="provider-status" role="status" aria-live="polite">{speechStatus}</p>}
      {speechPreferences.engine==="kokoro"&&speechPreparing&&<progress className="speech-download-progress" value={speechProgress} max="100" aria-label="Local voice model preparation progress"/>}
    </fieldset>
    <fieldset className="kuro-voice-settings">
      <legend>Kuro's personality · fixed</legend>
      <p>Kuro has one consistent personality across every voice option: thoughtful, highly engaged, curious, warm, naturally playful and lightly tsundere when it fits. She adapts to context instead of changing into a different character; serious moments come before teasing. Changing SAKURA, Chiaki or Mitsuri changes the vocal performance, not who Kuro is.</p>
      <button type="button" className="provider-secondary" onClick={previewVoice} disabled={busy || voiceTesting || !localModelPrepared}>{voiceTesting ? "Generating and speaking…" : "Generate & speak Kuro sample"}</button>
      {voicePreview && <blockquote className="kuro-voice-preview" aria-live="polite">{voicePreview}</blockquote>}
    </fieldset>
    {status && <p className="provider-status" role="status">{status}</p>}
    {error && <p className="provider-error" role="alert">{error}</p>}
    <p className="provider-warning">Kuro’s chat and project-memory paths remain local to the configured Qwen model. If Fish Audio is selected for speech, the spoken text and your API key are sent to Fish Audio for audio generation. No remote chat-model fallback is used. Image understanding is not supported by Qwen3-0.6B here.</p>
    <div className="provider-actions">
      <button className="provider-secondary" onClick={closeSettings}>Close</button>
      <button onClick={save} disabled={busy || voiceTesting}>Use Qwen3-0.6B</button>
    </div>
  </section>;
}
