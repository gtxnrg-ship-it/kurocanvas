import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InlineReferenceResults, { safeWikimediaThumbnailUrl } from "./InlineReferenceResults";
import type { ReferenceSearchResult } from "./referenceScout";

const result: ReferenceSearchResult = {
  title: "Rainy street at night.jpg",
  description: "Wet pavement reflecting warm lantern light.",
  query: "rainy street at night",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Rainy_street_at_night.jpg",
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/r/r1/rain.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/r/r1/rain.jpg/480px-rain.jpg",
  creator: "Example Photographer",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Attribution required",
};

describe("inline visual-reference results", () => {
  it("only displays thumbnails hosted by Wikimedia Commons uploads over HTTPS", () => {
    expect(safeWikimediaThumbnailUrl(result.thumbnailUrl)).toBe(result.thumbnailUrl);
    expect(safeWikimediaThumbnailUrl("http://upload.wikimedia.org/image.jpg")).toBeUndefined();
    expect(safeWikimediaThumbnailUrl("https://images.example.test/image.jpg")).toBeUndefined();
    expect(safeWikimediaThumbnailUrl("https://user@upload.wikimedia.org/image.jpg")).toBeUndefined();
    expect(safeWikimediaThumbnailUrl("https://user:pass@upload.wikimedia.org/image.jpg")).toBeUndefined();
    expect(safeWikimediaThumbnailUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("shows source, creator, license, attribution and a proposal-only save action", () => {
    const html = renderToStaticMarkup(<InlineReferenceResults projectId="project-1" results={[result]} />);
    expect(html).toContain("Visual references");
    expect(html).toContain("Rainy street at night.jpg");
    expect(html).toContain("Example Photographer");
    expect(html).toContain("CC BY 4.0");
    expect(html).toContain("Attribution required");
    expect(html).toContain("Save proposal");
    expect(html).toContain("does not approve the material");
    expect(html).toContain('src="https://upload.wikimedia.org/');
    expect(html).toContain('href="https://commons.wikimedia.org/wiki/File:Rainy_street_at_night.jpg"');
  });

  it("shows a fetching label until a safe thumbnail loads", () => {
    const html = renderToStaticMarkup(<InlineReferenceResults projectId="" results={[result]} />);
    expect(html).toContain("Fetching image…");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("Rainy street at night.jpg");
  });

  it("explains that a thumbnail is unavailable without loading an untrusted URL", () => {
    const html = renderToStaticMarkup(<InlineReferenceResults
      projectId=""
      results={[{ ...result, thumbnailUrl: "https://images.example.test/pixel.png" }]}
    />);
    expect(html).toContain("Thumbnail unavailable");
    expect(html).not.toContain('src="https://images.example.test/pixel.png"');
    expect(html).not.toContain("Fetching image…");
  });
});
