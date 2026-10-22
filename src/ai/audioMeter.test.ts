import { describe, expect, it } from "vitest";
import { normalizedAudioLevel } from "./audioMeter";

describe("normalizedAudioLevel", () => {
  it("returns zero for empty samples and digital silence", () => {
    expect(normalizedAudioLevel(new Uint8Array())).toBe(0);
    expect(normalizedAudioLevel(new Uint8Array(16).fill(128))).toBe(0);
  });

  it("normalizes stronger audio to a higher meter level", () => {
    const quiet = new Uint8Array([127, 128, 129, 128, 127, 128, 129, 128]);
    const strong = new Uint8Array([32, 224, 48, 208, 56, 200, 24, 232]);
    expect(normalizedAudioLevel(strong)).toBeGreaterThan(normalizedAudioLevel(quiet));
    expect(normalizedAudioLevel(strong)).toBeLessThanOrEqual(1);
    expect(normalizedAudioLevel(strong)).toBeGreaterThan(0);
  });

  it("clamps oversized readings rather than exceeding the visual scale", () => {
    expect(normalizedAudioLevel(new Uint8Array(16).fill(0))).toBeLessThanOrEqual(1);
    expect(normalizedAudioLevel(new Uint8Array(16).fill(255))).toBeLessThanOrEqual(1);
  });
});
