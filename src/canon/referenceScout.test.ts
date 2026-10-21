import { describe, expect, it } from "vitest";
import { buildReferenceContext, extractReferenceSearchQuery, normalizeReferenceSearchResults, parseWikimediaSearchResponse, selectApprovedReferenceImages, validateReferenceSource, type ReferenceSearchResult, type ReferenceSourceRecord } from "./referenceScout";

const record = (overrides: Partial<ReferenceSourceRecord> = {}): ReferenceSourceRecord => ({
  id: "ref-1", projectId: "project-1", title: "Rainy city street", description: "Night street with reflections",
  query: "rainy city street", sourceUrl: "https://commons.wikimedia.org/wiki/File:Rain.jpg",
  imageUrl: "https://upload.wikimedia.org/example.jpg", thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
  creator: "A. Creator", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Attribution required", notes: "Use lighting only; do not copy people.", tags: ["lighting"], status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

describe("reference scout", () => {
  it("recognizes explicit image-reference searches but leaves ordinary prose alone", () => {
    expect(extractReferenceSearchQuery("Find reference images for a medieval Kyoto street at night"))
      .toBe("a medieval Kyoto street at night");
    expect(extractReferenceSearchQuery("Please search for photos of 19th century steam trains"))
      .toBe("19th century steam trains");
    expect(extractReferenceSearchQuery("Search Wikimedia Commons for weathered wooden shrine gates"))
      .toBe("weathered wooden shrine gates");
    expect(extractReferenceSearchQuery("What images should I describe in chapter three?")).toBeUndefined();
    expect(extractReferenceSearchQuery("Find reference images, please")).toBeUndefined();
  });


  it("parses Wikimedia image metadata and ignores insecure/malformed records", () => {
    const results = parseWikimediaSearchResponse({
      query: { pages: {
        "1": { title: "File:Rainy_street.jpg", imageinfo: [{ url: "https://upload.wikimedia.org/full.jpg", thumburl: "https://upload.wikimedia.org/thumb.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Rainy_street.jpg", extmetadata: { LicenseShortName: { value: "CC BY 4.0" }, Artist: { value: "<a>Jane Doe</a>" }, ImageDescription: { value: "Wet &amp; shiny street" } } }] },
        "2": { title: "File:Unsafe.jpg", imageinfo: [{ url: "http://unsafe.example/a.jpg", thumburl: "http://unsafe.example/a.jpg", descriptionurl: "http://unsafe.example/page" }] },
        "3": { title: "File:No image info.jpg" },
      } },
    }, "rainy street");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Rainy_street.jpg");
    expect(results[0].license).toBe("CC BY 4.0");
    expect(results[0].creator).toBe("Jane Doe");
    expect(results[0].description).toBe("Wet & shiny street");
  });

  it("rejects external HTTPS image hosts from the Wikimedia API payload", () => {
    const results = parseWikimediaSearchResponse({
      query: { pages: {
        "1": { title: "File:External.jpg", imageinfo: [{ url: "https://evil.example/full.jpg", thumburl: "https://evil.example/thumb.jpg", descriptionurl: "https://evil.example/source" }] },
        "2": { title: "File:External source.jpg", imageinfo: [{ url: "https://upload.wikimedia.org/full.jpg", thumburl: "https://upload.wikimedia.org/thumb.jpg", descriptionurl: "https://evil.example/source" }] },
      } },
    }, "external");
    expect(results).toEqual([]);
  });

  it("validates persisted reference cards and drops non-Wikimedia image URLs", () => {
    const trusted: ReferenceSearchResult = {
      title: "Rain",
      description: "Rain over a street",
      query: "rain",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Rain.jpg",
      imageUrl: "https://upload.wikimedia.org/full.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
      creator: "Photographer",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Credit the creator",
    };
    expect(normalizeReferenceSearchResults([trusted])).toEqual([trusted]);
    expect(normalizeReferenceSearchResults([{ ...trusted, thumbnailUrl: "https://untrusted.example/image.jpg" }])).toEqual([]);
    expect(normalizeReferenceSearchResults([{ ...trusted, sourceUrl: "https://untrusted.example/page" }])).toEqual([]);
  });

  it("validates HTTPS source, image, and license links plus project isolation", () => {
    expect(validateReferenceSource(record(), "project-1")).toEqual([]);
    expect(validateReferenceSource(record({ projectId: "other" }), "project-1").join(" ")).toContain("different project");
    expect(validateReferenceSource(record({ sourceUrl: "http://unsafe.example" })).join(" ")).toContain("HTTPS");
  });

  it("uses only approved, project-scoped reference metadata and never claims to see image pixels", () => {
    const approved = record();
    const proposed = record({ id: "ref-2", title: "Unreviewed portrait", status: "proposed" });
    const context = buildReferenceContext([approved, proposed], "project-1", "draw rainy city street");
    expect(context).toContain("Rainy city street");
    expect(context).not.toContain("Unreviewed portrait");
    expect(context).toContain("visual inspection is grounded only when an approved image URL is separately attached");
    expect(buildReferenceContext([approved], "project-1", "spaceship interior")).toBe("");
  });

  it("selects only relevant approved Wikimedia image URLs for vision input", () => {
    const approved = record({ imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Rain.jpg" });
    const proposed = record({ id: "ref-2", status: "proposed", title: "Rainy city street draft" });
    const arbitraryHost = record({ id: "ref-3", imageUrl: "https://images.example.test/rain.jpg" });
    const unrelated = record({ id: "ref-4", title: "Spaceship interior", description: "Spaceship cabin with holographic controls", query: "spaceship interior", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/s/ship.jpg" });
    const selected = selectApprovedReferenceImages([approved, proposed, arbitraryHost, unrelated], "project-1", "draw rainy city street");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ title: "Rainy city street", imageUrl: approved.imageUrl, sourceUrl: approved.sourceUrl });
  });

  it("does not attach approved images from another project or when no visual term matches", () => {
    expect(selectApprovedReferenceImages([record({ projectId: "other" })], "project-1", "rainy city street")).toEqual([]);
    expect(selectApprovedReferenceImages([record()], "project-1", "spaceship cockpit")).toEqual([]);
  });

  it("rejects malformed query input before sending a network request", async () => {
    const { searchWikimediaCommons } = await import("./referenceScout");
    await expect(searchWikimediaCommons(" ")).rejects.toThrow(/at least two characters/i);
  });
});
