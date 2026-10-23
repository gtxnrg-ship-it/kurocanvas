import { useEffect, useRef, useState } from "react";
import ModelAdvisor from "./ModelAdvisor";
import { createConfiguredProvider, isLocalTinyModelPrepared, LOCAL_TINY_BASE_URL, LOCAL_TINY_MODEL_URI, prepareLocalTinyModel } from "./providerFactory";
import type { ModelDescriptor } from "./modelRegistry";
import { getKuroVoiceGuidance, KURO_PERSONA_CORE } from "./kuroPersona";
import { createLocalModelBenchmark, loadLocalModelBenchmark, localBenchmarkRatingLabel, saveLocalModelBenchmark, type LocalModelBenchmark } from "./modelBenchmark";
import { KURO_TINY_MODEL_DESCRIPTOR_ID } from "./localTinyModelConfig";
import { KURO_FISH_VOICES, KURO_SPEECH_MODEL_ID, KURO_SPEECH_VOICES, prepareKuroVoice, readKuroSpeechPreferences, saveKuroSpeechPreferences, speakKuroVoice, type KuroSpeechEngine, type KuroSpeechPreferences } from "./kuroSpeech";

export interface ActiveProviderConfig {
  /** Active local configuration or explicitly consented external provider settings. */
  baseUrl: string;
  modelUri: string;
  apiKey?: string;
  allowInsecureLocalhost: boolean;
  supportsVision?: boolean;
  /** True only after the creator has accepted the remote data-sharing warning. */
  allowRemoteData?: boolean;
}

interface ProviderSettingsProps {
  initialBaseUrl: string;
  initialModelUri: string;
  initialSupportsVision?: boolean;
  initialAllowRemoteData?: boolean;
  onSave: (config: ActiveProviderConfig) => void;
  onClose: () => void;
}

const canonicalConfig: ActiveProviderConfig = {
  baseUrl: LOCAL_TINY_BASE_URL,
  modelUri: LOCAL_TINY_MODEL_URI,
  allowInsecureLocalhost: false,
  supportsVision: false,
};

export default function ProviderSettings({
  initialBaseUrl, initialModelUri, initialSupportsVision, initialAllowRemoteData, onSave, onClose,
}: ProviderSettingsProps) {
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
  const [externalBaseUrl, setExternalBaseUrl] = useState(() =>
    (initialBaseUrl.startsWith("http://") || initialBaseUrl.startsWith("https://"))
      ? initialBaseUrl
      : "https://api.openai.com/v1"
  );
  const [externalApiKey, setExternalApiKey] = useState(() => {
    try { return globalThis.sessionStorage?.getItem("kuro-model-api-key") ?? ""; } catch { return ""; }
  });
  const [externalModelUri, setExternalModelUri] = useState(() =>
    initialBaseUrl !== LOCAL_TINY_BASE_URL ? initialModelUri : ""
  );
  const [externalAllowInsecureLocalhost, setExternalAllowInsecureLocalhost] = useState(
    initialBaseUrl.startsWith("http://localhost") || initialBaseUrl.startsWith("http://127.0.0.1") || initialBaseUrl.startsWith("http://[::1]")
  );
  const [externalSupportsVision, setExternalSupportsVision] = useState(
    initialBaseUrl !== LOCAL_TINY_BASE_URL && initialSupportsVision === true
  );
  const [externalConsent, setExternalConsent] = useState(
    initialBaseUrl !== LOCAL_TINY_BASE_URL && initialAllowRemoteData === true
  );
  const [externalModels, setExternalModels] = useState<ModelDescriptor[]>([]);
  const [externalModelChecking, setExternalModelChecking] = useState(false);

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

  function externalProviderConfig(modelUri = externalModelUri): ActiveProviderConfig {
    return {
      baseUrl: externalBaseUrl.trim(),
      modelUri: modelUri.trim(),
      apiKey: externalApiKey.trim() || undefined,
      allowInsecureLocalhost: externalAllowInsecureLocalhost,
      supportsVision: externalSupportsVision,
      allowRemoteData: true,
    };
  }

  async function checkExternalEndpoint() {
    if (!externalConsent) {
      setError("Enable the explicit consent checkbox after reviewing what project information may leave this device.");
      return;
    }
    setExternalModelChecking(true);
    setError("");
    setStatus("Checking the configured endpoint and listing its model IDs…");
    try {
      const provider = createConfiguredProvider(externalProviderConfig(""));
      const found = await provider.listModels();
      if (!found.length) throw new Error("The endpoint responded, but did not return any model IDs. Use an OpenAI-compatible /models endpoint that lists the model you intend to use.");
      setExternalModels(found);
      const selected = found.some(model => model.modelUri === externalModelUri || model.name === externalModelUri);
      if (!selected) setExternalModelUri(found[0].modelUri || found[0].name);
      setStatus("Endpoint responded and listed " + found.length + " model ID" + (found.length === 1 ? "" : "s") + ". This check sends no conversation or project text.");
    } catch (providerError) {
      setExternalModels([]);
      setError(providerError instanceof Error ? providerError.message : "Could not list models from the configured endpoint.");
    } finally {
      setExternalModelChecking(false);
    }
  }

  async function useExternalEndpoint() {
    if (!externalConsent) {
      setError("Explicit consent is required before external model use can be enabled.");
      return;
    }
    if (!externalModelUri.trim()) {
      setError("Test the endpoint and choose a model ID before connecting.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Rechecking the selected model before enabling external requests…");
    try {
      const config = externalProviderConfig();
      const provider = createConfiguredProvider(config);
      const found = await provider.listModels();
      const selected = found.find(model => model.modelUri === externalModelUri.trim() || model.name === externalModelUri.trim());
      if (!selected) {
        setExternalModels(found);
        throw new Error("The selected model ID was not returned by this endpoint. Check the model list and choose an exact listed ID.");
      }
      onSave({ ...config, modelUri: selected.modelUri || selected.name });
      setStatus("External model connected. Prompts and selected project context will be sent to this endpoint.");
      closeSettings();
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : "Could not connect to the external model.");
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
        setSpeechStatus(speechPreferences.engine==="kokoro"?"Preparing Kuro's local Kokoro voice…":speechPreferences.engine==="fish"?"Generating Kuro's voice with Fish Audio Drama 3…":"Speaking with the device's speech voice…");
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
        <small>MODEL PROVIDER · LOCAL BY DEFAULT</small>
        <h2 id="provider-settings-title">Kuro's intelligence</h2>
        <p>Qwen3-0.6B is Kuro’s private, on-device default. You can also configure a compatible external model below, but only after explicitly reviewing and accepting the data-sharing warning. The app still uses native editable drawing tools, never image-generation output.</p>
      </div>
      <button onClick={closeSettings} aria-label="Close settings">×</button>
    </div>
    <ModelAdvisor benchmark={localBenchmark} />
    <div className="provider-recommended-model">
      <strong>Qwen3-0.6B · local default</strong>
      <p>The quantized ONNX weights are approximately 370 MB. Download and model initialization happen only when you explicitly choose “Download & prepare Qwen3-0.6B”; external-model setup never triggers this download. Transformers.js caches files in this browser, but browser storage may be evicted. Runtime memory is higher than download size and varies by device. Qwen is text-only: Kuro uses editable canvas/document data and validated native drawing tools rather than pretending the local model can see image pixels.</p>
      <div className="provider-actions">
        <button type="button" onClick={checkModelAdapter} disabled={busy || voiceTesting}>{busy ? "Checking…" : "Check local adapter"}</button>
        <button type="button" onClick={downloadAndConnectLocalModel} disabled={busy || voiceTesting}>{localModelPreparing ? "Preparing… " + modelProgress + "%" : localModelPrepared ? "Prepare model again" : "Download & prepare Qwen3-0.6B"}</button>
        {localModelPreparing && <button type="button" className="provider-secondary" onClick={cancelLocalModelPreparation}>Cancel preparation</button>}
      </div>
      <button type="button" className="provider-secondary" onClick={benchmarkLocalModel} disabled={busy || voiceTesting || !localModelPrepared}>{busy ? "Working…" : "Benchmark generation speed"}</button>
      <p className="provider-muted">Speed is measured on this device after a warm-up; it does not measure writing quality, tool reliability, or canvas performance. A page reload clears the live model session, so prepare Qwen again before benchmarking or using voice preview.</p>
      <a href="https://huggingface.co/onnx-community/Qwen3-0.6B-DQ-ONNX" target="_blank" rel="noreferrer">Model files and license ↗</a>
    </div>
    <fieldset className="provider-external-settings">
      <legend>Optional external model · advanced</legend>
      <p className="provider-muted">Use an OpenAI-compatible chat-completions endpoint, such as a provider API or a local runtime that exposes <code>/v1/models</code> and <code>/v1/chat/completions</code>. Local Qwen remains the default until you connect this option.</p>
      <label>API base URL<input type="url" value={externalBaseUrl} onChange={event=>{setExternalBaseUrl(event.target.value);setExternalModels([]);}} placeholder="https://api.openai.com/v1" autoComplete="off" spellCheck={false}/></label>
      <label>API key · kept in this browser session<input type="password" value={externalApiKey} onChange={event=>setExternalApiKey(event.target.value)} placeholder="API key (leave blank only if endpoint does not require one)" autoComplete="off" spellCheck={false}/></label>
      <label className="provider-check"><input type="checkbox" checked={externalAllowInsecureLocalhost} onChange={event=>setExternalAllowInsecureLocalhost(event.target.checked)}/> Allow HTTP for localhost only (never for a remote host)</label>
      <label className="provider-check"><input type="checkbox" checked={externalSupportsVision} onChange={event=>{setExternalSupportsVision(event.target.checked);setExternalModels([]);}}/> Enable image input (only if this exact model is known to support vision)</label>
      <div className="provider-data-disclosure">
        <strong>Before you connect, know what leaves this device</strong>
        <p>When enabled, Kuro sends model requests for chat, writing, drawing plans and native 3D planning, plus the relevant context she retrieves from your selected project. That may include approved canon, story memories, character timelines, relationships, research notes and visual-style rules. If image input is enabled, a rendered preview of the current canvas and approved reference images included in the request may also be sent. Kuro does not upload your entire local project database just by connecting.</p>
        <p>The endpoint may store requests or charge for use under its own terms. Your API key is not written to localStorage or project exports, but the browser must hold it in memory to make requests; it is not encrypted. Use only an endpoint you trust.</p>
      </div>
      <label className="provider-check provider-consent"><input type="checkbox" checked={externalConsent} onChange={event=>{
        const consent=event.target.checked;
        setExternalConsent(consent);setExternalModels([]);
        if(!consent&&initialBaseUrl!==LOCAL_TINY_BASE_URL&&initialAllowRemoteData===true){
          onSave(canonicalConfig);
          setExternalApiKey("");
          setStatus("External model disabled. New requests will use the local provider, and the active chat request is cancelled.");
        }
      }}/> I understand and consent to sending my prompts and relevant project context to this external endpoint. Unchecking this after connection immediately switches Kuro back to the local provider.</label>
      <div className="provider-actions">
        <button type="button" className="provider-secondary" onClick={()=>void checkExternalEndpoint()} disabled={busy||externalModelChecking||!externalConsent}>{externalModelChecking?"Checking endpoint…":"Test endpoint & load models"}</button>
      </div>
      <label>Model ID{externalModels.length ? <select value={externalModelUri} onChange={event=>setExternalModelUri(event.target.value)}><option value="">Choose a model…</option>{externalModels.map(model=><option key={model.id} value={model.modelUri||model.name}>{model.modelUri||model.name}</option>)}</select> : <input value={externalModelUri} onChange={event=>setExternalModelUri(event.target.value)} placeholder="Choose a model after checking the endpoint" autoComplete="off" spellCheck={false}/>}</label>
      {!externalModels.length&&<small className="provider-muted">First test the endpoint to retrieve the exact model IDs it lists. The ID must match one of those results to connect.</small>}
      {externalSupportsVision&&<p className="provider-warning">Image input is enabled by your selection. The app cannot independently verify a provider's model capabilities, so only use this with a model documented to accept image_url content. Qwen local remains text-only.</p>}
      <div className="provider-actions">
        <button type="button" onClick={()=>void useExternalEndpoint()} disabled={busy||externalModelChecking||!externalConsent||!externalModelUri.trim()}>{busy?"Verifying model…":"Use selected external model"}</button>
      </div>
    </fieldset>
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
        <label>English accent<select value={speechPreferences.accent} onChange={event=>updateSpeechPreferences({...speechPreferences,accent:event.target.value as KuroSpeechPreferences["accent"]})}>
          <option value="subtle-japanese">Subtle Japanese-inflected English · recommended starting point</option>
          <option value="noticeable-japanese">More noticeable Japanese-inflected English</option>
          <option value="natural">Natural English · no instructed accent</option>
        </select></label>
        <p>Voice audio is generated by Fish Audio, not on this device. Fish Audio receives the text Kuro reads aloud (which can include details from this conversation or story), the selected voice profile ID, and your API key. This integration does not send the whole chat or Vault separately, but any private detail included in spoken text is shared with the speech provider. The key is kept in this browser session's sessionStorage (not encrypted) and is not intentionally persisted across sessions. Close the app/browser session to clear it; device/browser behavior can vary. Drama 3 API usage may be billed; check current pricing and the model/voice terms before using or distributing generated audio. <a href="https://fish.audio/developers/" target="_blank" rel="noreferrer">Get an API key</a> · <a href="https://fish.audio/pricing/" target="_blank" rel="noreferrer">Check pricing</a> · <a href="https://huggingface.co/fishaudio/drama-3" target="_blank" rel="noreferrer">Drama 3 license</a>.</p>
        <p className="speech-model-links">Listen to the <a href={KURO_FISH_VOICES[0].sampleUrl} target="_blank" rel="noreferrer">SAKURA sample</a>, <a href={KURO_FISH_VOICES[1].sampleUrl} target="_blank" rel="noreferrer">Chiaki sample</a>, or <a href={KURO_FISH_VOICES[2].sampleUrl} target="_blank" rel="noreferrer">Mitsuri sample</a>.</p>
      </>}
      {speechPreferences.engine==="kokoro"&&<label>Kuro's voice<select value={speechPreferences.voice} onChange={event=>updateSpeechPreferences({...speechPreferences,voice:event.target.value})}>
        {KURO_SPEECH_VOICES.map(voice=><option value={voice.id} key={voice.id}>{voice.label}</option>)}
      </select></label>}
      <label>Speaking pace <span>{speechPreferences.rate.toFixed(2)}×</span><input type="range" min="0.8" max="1.2" step="0.05" value={speechPreferences.rate} onChange={event=>updateSpeechPreferences({...speechPreferences,rate:Number(event.target.value)})}/></label>
      <p>{speechPreferences.engine==="fish"?"Fish Audio's Drama 3 engine applies the chosen profile to English text and uses native prosody speed control, so the pace slider does not simply raise the recording's pitch. Kuro's chat personality stays the same across these voice profiles; they change the sound of her speech, not who she is. The accent selector changes delivery instructions, not the underlying model or its training, and Drama 3 may follow those instructions differently for each profile and take. Test all three profiles and accent options with your own sample; the direction is not a guarantee of an exact accent.":speechPreferences.engine==="kokoro"?"Kokoro is an open-source, quantized local speech model. First use downloads its voice weights; later availability depends on the browser cache and device memory. Its included voices are not Japanese-accented.":"The device voice uses the operating system's speech engine. Available voices, realism, network needs and languages vary by Android/browser."}</p>
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
    <p className="provider-warning">Qwen chat remains on-device when Qwen is selected. External chat is never an automatic fallback and requires the consent checkbox above. If Fish Audio is selected for speech, the spoken text and your API key are sent to Fish Audio for audio generation. Qwen3-0.6B itself remains text-only.</p>
    <div className="provider-actions">
      <button className="provider-secondary" onClick={closeSettings}>Close</button>
      <button onClick={save} disabled={busy || voiceTesting}>Use Qwen3-0.6B</button>
    </div>
  </section>;
}
