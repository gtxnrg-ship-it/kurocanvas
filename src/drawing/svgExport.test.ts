import { describe, expect, it } from "vitest";
import { buildSvgDocument } from "./svgExport";

describe("SVG artwork export", () => {
  const layer = { id: "ink", name: "Ink", visible: true, opacity: 1, blendMode: "normal" };

  it("exports editable shapes, escaped multi-line lettering, and embedded images", () => {
    const svg = buildSvgDocument({
      width: 1600, height: 1200, background: "#fffdfb",
      layers: [layer], transparentBackground: true,
      strokes: [
        { id: "panel", layerId: "ink", tool: "brush", shape: "panel", color: "#191522", size: 6, points: [{ x: 10, y: 20 }, { x: 300, y: 200 }] },
        { id: "text", layerId: "ink", tool: "brush", shape: "text", color: "#191522", size: 24, text: "Wait & see\n<later>", fontFamily: "comic", points: [{ x: 40, y: 80 }] },
        { id: "image", layerId: "ink", tool: "brush", shape: "image", color: "#fff", size: 1, imageDataUrl: "data:image/png;base64,AAAA", points: [{ x: 50, y: 50 }, { x: 100, y: 100 }] },
      ],
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("Wait &amp; see");
    expect(svg).toContain("&lt;later&gt;");
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg).not.toContain('fill="#fffdfb"');
  });

  it("uses an SVG mask for eraser strokes and includes paper when requested", () => {
    const svg = buildSvgDocument({
      width: 100, height: 100, background: "#fefefe", layers: [layer], strokes: [
        { id: "mark", layerId: "ink", tool: "brush", color: "#000", size: 4, points: [{ x: 1, y: 1 }, { x: 30, y: 30 }] },
        { id: "erase", layerId: "ink", tool: "eraser", color: "#000", size: 8, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
      ],
    });
    expect(svg).toContain('<rect width="100%" height="100%" fill="#fefefe"/>');
    expect(svg).toContain('<mask id="kuro-layer-ink-erase-0-mask"');
    expect(svg).toContain('stroke="black"');
  });
});
