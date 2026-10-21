import { useState } from "react";
import { OpenAICompatibleProvider } from "./openAICompatibleProvider";
import type { ModelDescriptor } from "./modelRegistry";
import type { KuroVoiceIntensity } from "./kuroPersona";
import { getKuroVoiceGuidance, KURO_PERSONA_CORE } from "./kuroPersona";

export interface ActiveProviderConfig {
  baseUrl: string;
  modelUri: string;
  apiKey?: string;
  allowInsecureLocalhost: boolean;
}

interface ProviderSettingsProps {
  initialBaseUrl: string;
  initialModelUri: string;
  voiceIntensity: KuroVoiceIntensity;
  onVoiceIntensityChange: (intensity: KuroVoiceIntensity) => void;
  onSave: (config: ActiveProviderConfig) => void;
  onClose: () => void;
}

export default function ProviderSettings({ initialBaseUrl, initialModelUri, voiceIntensity, onVoiceIntensityChange, onSave, onClose }: ProviderSettingsProps) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl || "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [modelUri, setModelUri] = useState(initialModelUri);
  const [allowInsecureLocalhost, setAllowInsecureLocalhost] = useState(baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1"));
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voicePreview, setVoicePreview] = useState("");

  function useRecommendedQwenLocalEndpoint() {
    setBaseUrl("http://localhost:8000/v1");
    setModelUri("Qwen/Qwen3.8-27B");
    setAllowInsecureLocalhost(true);
    setModels([]);
    setError("");
    setStatus("Desktop/server preset selected. This does not install the model; start the separate Qwen3.8-27B inference server, then test the connection.");
  }

  async function discoverModels() {
    setBusy(true); setError(""); setStatus("");
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl, apiKey: apiKey.trim() || undefined, allowInsecureLocalhost });
      const found = await provider.listModels();
      setModels(found);
      if (!found.length) setStatus("The endpoint responded, but did not return any model IDs.");
      else {
        setStatus("Found " + found.length + " model(s). Choose one, then connect.");
        if (!modelUri || !found.some(model => model.modelUri === modelUri)) setModelUri(found[0].modelUri || found[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to the model provider.");
    } finally { setBusy(false); }
  }

  async function previewVoice() {
    const selected = models.find(model => model.modelUri === modelUri || model.name === modelUri);
    if (!selected) { setError("Test the connection and select a model before previewing Kuro's voice."); return; }
    setVoiceTesting(true); setError(""); setVoicePreview("");
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl, apiKey: apiKey.trim() || undefined, allowInsecureLocalhost });
      const response = await provider.generate({
        role: "reasoning",
        messages: [
          { role: "system", content: KURO_PERSONA_CORE + "\n\n" + getKuroVoiceGuidance(voiceIntensity) },
          { role: "user", content: "Reply naturally to a manga creator who feels overwhelmed and does not know where to start drawing a scene. Be playfully tsundere if it fits, then offer one useful first step. Keep it to 2–4 sentences." },
        ],
        temperature: 0.75,
        maxOutputTokens: 220,
      }, selected);
      setVoicePreview(response.text.trim() || "The model returned an empty reply. Try again or choose another model.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kuro's voice preview failed.");
    } finally { setVoiceTesting(false); }
  }

  function save() {
    if (!baseUrl.trim() || !modelUri.trim()) { setError("Enter a provider URL and choose a model."); return; }
    try {
      // Validate the URL/security policy before handing configuration to the app.
      new OpenAICompatibleProvider({ baseUrl, apiKey: apiKey.trim() || undefined, allowInsecureLocalhost });
      onSave({ baseUrl: baseUrl.trim(), modelUri: modelUri.trim(), apiKey: apiKey.trim() || undefined, allowInsecureLocalhost });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid provider configuration."); }
  }

  return <section className="provider-settings" role="dialog" aria-modal="true" aria-labelledby="provider-settings-title">
    <div className="provider-settings-head"><div><small>REAL MODEL CONNECTION</small><h2 id="provider-settings-title">Connect Kuro to a model</h2><p>Works with compatible hosted APIs and local inference servers. Model weights and inference software are installed separately.</p></div><button onClick={onClose} aria-label="Close settings">×</button></div>
    <fieldset className="kuro-voice-settings"><legend>Kuro's personality</legend><label>Tsundere intensity<select value={voiceIntensity} onChange={e=>onVoiceIntensityChange(e.target.value as KuroVoiceIntensity)}><option value="subtle">Subtle · dry wit, gentle warmth</option><option value="playful">Balanced · playful teasing</option><option value="expressive">Expressive · dramatic anime energy</option></select></label><p>Her personality stays natural and context-aware. When you're genuinely upset or discussing something serious, she puts the teasing aside.</p><button type="button" className="provider-secondary" onClick={previewVoice} disabled={voiceTesting||models.length===0}>{voiceTesting?"Trying her voice…":"Preview Kuro's voice"}</button>{voicePreview&&<blockquote className="kuro-voice-preview" aria-live="polite">{voicePreview}</blockquote>}</fieldset>
    <div className="provider-recommended-model">
      <strong>Desktop/server evaluation candidate: Qwen3.8-27B</strong>
      <p>Optional multimodal, agent-focused, Apache-2.0 candidate for capable desktops/servers only—not Kuro's default and not a phone recommendation. Full-precision weights are about 55.6 GB and runtime memory needs are higher. For Android, we must benchmark compact models on real low-end devices before choosing a default; Kuro's non-AI canvas and saved-universe features should not depend on downloading a large model. Kuro can attach a bounded canvas preview to drawing and visual-inspection requests for models advertising vision; general reference uploads and a full iterative visual-QA loop are still unfinished. See the device-tier model strategy guide.</p>
      <button type="button" className="provider-secondary" onClick={useRecommendedQwenLocalEndpoint}>Use local Qwen3.8 endpoint</button>
      <a href="https://huggingface.co/Qwen/Qwen3.8-27B" target="_blank" rel="noreferrer">Official model card ↗</a>
    </div>
    <label>API base URL<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" autoComplete="url" /></label>
    <label>API key <span className="provider-muted">(kept in memory only; re-enter after refresh)</span><input value={apiKey} onChange={e=>setApiKey(e.target.value)} type="password" autoComplete="new-password" placeholder="Optional for local endpoints" /></label>
    <label className="provider-check"><input type="checkbox" checked={allowInsecureLocalhost} onChange={e=>setAllowInsecureLocalhost(e.target.checked)} /> Allow HTTP only for a localhost model endpoint</label>
    <div className="provider-actions"><button onClick={discoverModels} disabled={busy}>{busy ? "Checking…" : "Test connection and list models"}</button></div>
    {models.length > 0 && <label>Model<select value={modelUri} onChange={e=>setModelUri(e.target.value)}>{models.map(m=><option key={m.id} value={m.modelUri || m.name}>{m.name}</option>)}</select></label>}
    {!models.length && <label>Model ID<input value={modelUri} onChange={e=>setModelUri(e.target.value)} placeholder="e.g. gpt-4.1-mini or local model ID" /></label>}
    {status && <p className="provider-status">{status}</p>}
    {error && <p className="provider-error" role="alert">{error}</p>}
    <p className="provider-warning">Local-model setup: run an OpenAI-compatible server for Qwen3.8-27B on this computer at <code>http://localhost:8000/v1</code>, then select the returned model ID. This preset does not download or start the model. <a href="https://huggingface.co/Qwen/Qwen3.8-27B" target="_blank" rel="noreferrer">Official install instructions</a>. Privacy note: requests are sent to the provider you configure. In a browser app, hosted API keys are exposed to the client while in use; use a trusted provider and avoid shared devices. Kuro does not save the key to local storage or project files.</p>
    <div className="provider-actions"><button className="provider-secondary" onClick={onClose}>Cancel</button><button onClick={save}>Connect model</button></div>
  </section>;
}