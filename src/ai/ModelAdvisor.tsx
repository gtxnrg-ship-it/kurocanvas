import { useEffect, useState } from "react";
import { assessDevice, type DeviceAssessment } from "./deviceAssessment";
import { validateLocalModelBenchmark, type LocalModelBenchmark, localBenchmarkRatingLabel } from "./modelBenchmark";

function formatBenchmark(benchmark?: LocalModelBenchmark): string {
  if (!benchmark || !validateLocalModelBenchmark(benchmark) || benchmark.modelId !== "kuro-local:qwen3-0.6b") {
    return "Not measured on this device yet";
  }
  return localBenchmarkRatingLabel(benchmark.rating) + " · " + benchmark.tokensPerSecond.toFixed(1) + " tokens/s";
}

export default function ModelAdvisor({ benchmark }: { benchmark?: LocalModelBenchmark }) {
  const [device, setDevice] = useState<DeviceAssessment>();
  useEffect(() => {
    let active = true;
    void assessDevice().then(value => { if (active) setDevice(value); });
    return () => { active = false; };
  }, []);

  const lowMemory = device?.deviceMemoryGiB !== undefined && device.deviceMemoryGiB < 2;
  const hasWebAssembly = device?.webAssembly === true;

  return <section aria-label="Qwen device readiness" style={{ margin: "16px 0", padding: 14, border: "1px solid var(--border, #444)", borderRadius: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <strong>On-device readiness</strong>
      <span style={{ fontSize: 12, opacity: .75 }}>Local check · no device fingerprint sent</span>
    </div>
    {device ? <>
      <p style={{ margin: "8px 0", fontSize: 13 }}>Device environment: <strong>{device.environment}</strong> · {device.browser} · {device.cores ? device.cores + " logical cores" : "CPU details unavailable"} · {device.deviceMemoryGiB ? device.deviceMemoryGiB + " GiB reported memory" : "RAM not exposed"}.</p>
      <p style={{ margin: "6px 0", fontSize: 12, opacity: .8 }}>WebAssembly: {hasWebAssembly ? "available" : "not detected"} · WebGPU: {device.webGPU ? "detected (not used as a quality guarantee)" : "not detected"} · estimate confidence: {device.confidence}.</p>
      <p style={{ margin: "6px 0", fontSize: 13 }}>{lowMemory
        ? "This device reports less than 2 GiB of memory. A 370 MB model download can require substantially more working memory; generation may fail or the browser may reload."
        : "Device checks are estimates only. Actual performance depends on available memory, browser support, battery/thermal limits, and other running apps."}</p>
      <ul style={{ fontSize: 12, opacity: .8, paddingLeft: 18 }}>{device.notes.map(note => <li key={note}>{note}</li>)}</ul>
    </> : <p style={{ fontSize: 13 }}>Checking browser capabilities…</p>}
    <div style={{ borderTop: "1px solid var(--border, #444)", paddingTop: 12, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>Qwen3-0.6B · Q4F16 ONNX</strong>
        <span style={{ fontSize: 12, fontWeight: 650 }}>{formatBenchmark(benchmark)}</span>
      </div>
      <p style={{ fontSize: 13, margin: "6px 0" }}>The single active Kuro model. Text-only, roughly 370 MB of model files. Runtime memory is higher than download size.</p>
      {benchmark && validateLocalModelBenchmark(benchmark) && benchmark.modelId === "kuro-local:qwen3-0.6b" && <p role="status" style={{ fontSize: 12, margin: "8px 0 0", padding: 8, borderRadius: 8, background: "rgba(125,125,125,.09)" }}>{benchmark.tokensPerSecond.toFixed(1)} generated tokens/s · {benchmark.outputTokens} tokens in {benchmark.elapsedMs} ms<br /><span style={{ opacity: .75 }}>Measured locally on {new Date(benchmark.measuredAt).toLocaleString()}. This is a warm text-generation benchmark, not a story-quality or drawing-quality score.</span></p>}
    </div>
  </section>;
}
