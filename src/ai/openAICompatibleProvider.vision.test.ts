import { describe, expect, it } from "vitest";
import { inferModelCapabilities } from "./openAICompatibleProvider";

describe("vision capability inference", () => {
  it.each([
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-5.6",
    "gemini-2.5-flash",
    "claude-sonnet-4",
    "Qwen2.5-VL-7B",
    "llama-3.2-vision",
    "pixtral-large",
  ])("recognizes likely vision model %s", name => {
    expect(inferModelCapabilities(name)).toContain("vision");
  });

  it("does not assume a plain text model supports images", () => {
    expect(inferModelCapabilities("llama-3.1-8b-instruct")).toEqual(["chat"]);
  });
});
