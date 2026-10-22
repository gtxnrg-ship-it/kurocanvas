import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface LiveAudioVisualizerHandle {
  setInputLevel(level: number): void;
  setOutputLevel(level: number): void;
}
interface LiveAudioVisualizerProps { active: boolean; status: string; }

const BAR_COUNT = 22;

/** Audio-reactive live-session meter. Level updates are throttled locally so the full app does not rerender each animation frame. */
const LiveAudioVisualizer = forwardRef<LiveAudioVisualizerHandle, LiveAudioVisualizerProps>(function LiveAudioVisualizer({ active, status }, ref) {
  const [inputLevel, setInputLevelState] = useState(0);
  const [outputLevel, setOutputLevelState] = useState(0);
  const lastInputPaint = useRef(0);
  const lastOutputPaint = useRef(0);

  const setInputLevel = useCallback((level: number) => {
    const now = performance.now();
    if (level === 0 || now - lastInputPaint.current >= 55) {
      lastInputPaint.current = now;
      setInputLevelState(Math.max(0, Math.min(1, level)));
    }
  }, []);
  const setOutputLevel = useCallback((level: number) => {
    const now = performance.now();
    if (level === 0 || now - lastOutputPaint.current >= 55) {
      lastOutputPaint.current = now;
      setOutputLevelState(Math.max(0, Math.min(1, level)));
    }
  }, []);

  useImperativeHandle(ref, () => ({ setInputLevel, setOutputLevel }), [setInputLevel, setOutputLevel]);
  useEffect(() => {
    if (!active) {
      setInputLevelState(0);
      setOutputLevelState(0);
    }
  }, [active]);

  const bars = Array.from({ length: BAR_COUNT }, (_, index) => {
    const envelope = 0.18 + Math.abs(Math.sin((index + 1) * 0.78)) * 0.82;
    return { index, inputHeight: Math.round(3 + inputLevel * 31 * envelope), outputHeight: Math.round(3 + outputLevel * 31 * envelope) };
  });
  return <div className={active ? "live-audio-visualizer is-active" : "live-audio-visualizer"} aria-label="Live audio levels">
    <div className="live-audio-row">
      <span className="live-audio-label">YOU</span>
      <div className="live-audio-bars input-level" role="img" aria-label={`Microphone level ${Math.round(inputLevel * 100)} percent`}>
        {bars.map(bar => <i key={bar.index} style={{ height: bar.inputHeight + "px" }} />)}
      </div>
      <span className="live-audio-percent">{Math.round(inputLevel * 100)}%</span>
    </div>
    <div className="live-audio-row">
      <span className="live-audio-label">KURO</span>
      <div className="live-audio-bars output-level" role="img" aria-label={`Kuro playback level ${Math.round(outputLevel * 100)} percent`}>
        {bars.map(bar => <i key={bar.index} style={{ height: bar.outputHeight + "px" }} />)}
      </div>
      <span className="live-audio-percent">{Math.round(outputLevel * 100)}%</span>
    </div>
    <p className="live-audio-caption" role="status" aria-live="polite">{active ? status : "Voice session is off"}</p>
  </div>;
});

export default LiveAudioVisualizer;
