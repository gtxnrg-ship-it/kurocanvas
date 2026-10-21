import { useEffect, useState } from "react";
import { assessDevice, type DeviceAssessment } from "./deviceAssessment";
import { KURO_MODEL_CATALOG, type KuroModelOption } from "./modelCatalog";

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "Size not verified";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  return Math.round(bytes / 1024 ** 2) + " MB";
}
function platformMatches(model: KuroModelOption, device: DeviceAssessment): boolean {
  if (device.environment === "android") return model.platforms.includes("android") || model.platforms.includes("web");
  if (device.environment === "ios") return model.platforms.includes("ios") || model.platforms.includes("web") || model.platforms.includes("tablet");
  if (device.environment === "desktop") return model.platforms.includes("desktop") || model.platforms.includes("web");
  return model.platforms.includes("web");
}
function statusLabel(model: KuroModelOption, device: DeviceAssessment): { label: string; color: string } {
  if (model.status === "available-in-web-build") {
    if (device.deviceMemoryGiB !== undefined && device.deviceMemoryGiB < 2) return { label: "Test cautiously", color: "#d99a16" };
    return { label: "Available · benchmark needed", color: "#d99a16" };
  }
  if (model.status === "remote-provider-needed") return { label: "Needs provider", color: "#6b7280" };
  if (model.minMemoryBytes && device.deviceMemoryGiB !== undefined && device.deviceMemoryGiB * 1024 ** 3 < model.minMemoryBytes) {
    return { label: "Not recommended for detected memory", color: "#d9534f" };
  }
  return { label: "Needs native runtime", color: "#6b7280" };
}
export default function ModelAdvisor() {
  const [device, setDevice] = useState<DeviceAssessment>();
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { let active = true; void assessDevice().then(value => { if (active) setDevice(value); }); return () => { active = false; }; }, []);
  const models = device ? KURO_MODEL_CATALOG.filter(model => showAll || platformMatches(model, device)) : KURO_MODEL_CATALOG;
  return <section aria-label="Device and model advisor" style={{ margin: "16px 0", padding: 14, border: "1px solid var(--border, #444)", borderRadius: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <strong>Device &amp; model advisor</strong>
      <span style={{ fontSize: 12, opacity: .75 }}>Local check · no device fingerprint sent</span>
    </div>
    {device ? <>
      <p style={{ margin: "8px 0", fontSize: 13 }}>Detected: <strong>{device.environment}</strong> · {device.browser} · {device.cores ? device.cores + " logical cores" : "CPU details unavailable"} · {device.deviceMemoryGiB ? device.deviceMemoryGiB + " GiB reported memory" : "RAM not exposed"}.</p>
      <p style={{ margin: "6px 0", fontSize: 12, opacity: .8 }}>WebAssembly: {device.webAssembly ? "yes" : "no"} · WebGPU: {device.webGPU ? "available (not yet benchmarked)" : "not detected"} · estimate confidence: {device.confidence}.</p>
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {models.map(model => {
          const status = statusLabel(model, device);
          return <article key={model.id} style={{ border: "1px solid var(--border, #444)", borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <strong>{model.name}</strong>
              <span style={{ color: status.color, fontSize: 12, fontWeight: 650, textAlign: "right" }}>{status.label}</span>
            </div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>{model.tier} tier · {formatBytes(model.downloadBytes)} · {model.modalities.join(" + ")} · {model.runtime}</div>
            <p style={{ fontSize: 13, margin: "6px 0" }}>{model.bestFor}</p>
            <p style={{ fontSize: 12, opacity: .75, margin: 0 }}>{model.notes}</p>
            <a href={model.sourceUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 7, fontSize: 12 }}>Model details ↗</a>
          </article>;
        })}
      </div>
      <button type="button" className="provider-secondary" style={{ marginTop: 10 }} onClick={() => setShowAll(value => !value)}>{showAll ? "Show device-matched models" : "Show all model tiers"}</button>
      <ul style={{ fontSize: 12, opacity: .8, paddingLeft: 18 }}>{device.notes.map(note => <li key={note}>{note}</li>)}</ul>
    </> : <p style={{ fontSize: 13 }}>Checking browser capabilities…</p>}
  </section>;
}
