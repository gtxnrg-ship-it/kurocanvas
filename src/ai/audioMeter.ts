/** Real microphone-level monitoring for Kuro's live voice UI.
 * This is a separate, visualization-only stream: browser speech recognition still owns transcription.
 */
export function normalizedAudioLevel(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let energy = 0;
  for (let index = 0; index < samples.length; index++) {
    const centered = (samples[index] - 128) / 128;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / samples.length);
  return Math.max(0, Math.min(1, rms * 3.5));
}

export async function startKuroMicrophoneMeter(onLevel: (level: number) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not expose microphone audio levels.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let stopped = false;
  let frame = 0;
  try {
    const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error("Web Audio is not available for the microphone meter.");
    context = new Constructor();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    const sample = () => {
      if (stopped || !analyser) return;
      analyser.getByteTimeDomainData(buffer);
      onLevel(normalizedAudioLevel(buffer));
      frame = requestAnimationFrame(sample);
    };
    if (context.state === "suspended") await context.resume();
    frame = requestAnimationFrame(sample);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    try { source?.disconnect(); } catch { /* graph may not be connected */ }
    try { analyser?.disconnect(); } catch { /* graph may not be connected */ }
    try { void context?.close(); } catch { /* optional audio context */ }
    throw error;
  }
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    stream.getTracks().forEach(track => track.stop());
    try { source?.disconnect(); } catch { /* graph may already be disconnected */ }
    try { analyser?.disconnect(); } catch { /* graph may already be disconnected */ }
    try { void context?.close(); } catch { /* optional audio context */ }
    onLevel(0);
  };
}
