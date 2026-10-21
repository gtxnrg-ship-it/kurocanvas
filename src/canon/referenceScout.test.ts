import { describe, expect, it } from "vitest";
import { buildReferenceContext, getApprovedReferenceImages, parseWikimediaSearchResponse, validateReferenceSource, type ReferenceSourceRecord } from "./referenceScout";

const record = (overrides: Partial<ReferenceSourceRecord> = {}): ReferenceSourceRecord => ({
  id: "ref-1", projectId: "project-1", title: "Rainy city street", description: "Night street with reflections",
  query: "rainy city street", sourceUrl: "https://commons.wikimedia.org/wiki/File:Rain.jpg",
  imageUrl: "https://upload.wikimedia.org/example.jpg", thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
  creator: "A. Creator", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Attribution required", notes: "Use lighting only; do not copy people.", tags: ["lighting"], status: "approved",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

describe("reference scout", () => {
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
    expect(context).toContain("image pixels are not attached");
    expect(buildReferenceContext([approved], "project-1", "spaceship interior")).toBe("");
  });

  it("only returns approved images with explicit sharing consent for a relevant visual request", () => {
    const consented = record({ sendImageToModel: true });
    const notConsented = record({ id:"ref-no-consent", title:"Rainy city building", sendImageToModel:false });
    const proposed = record({ id:"ref-proposed", title:"Rainy city portrait", status:"proposed", sendImageToModel:true });
    const images = getApprovedReferenceImages([consented,notConsented,proposed],"project-1","draw rainy city street");
    expect(images).toEqual([{ title:"Rainy city street", imageUrl:consented.imageUrl, sourceUrl:consented.sourceUrl, license:consented.license }]);
    expect(getApprovedReferenceImages([consented],"project-1","spaceship battle")).toEqual([]);
  });

  it("rejects malformed query input before sending a network request", async () => {
    const { searchWikimediaCommons } = await import("./referenceScout");
    await expect(searchWikimediaCommons(" ")).rejects.toThrow(/at least two characters/i);
  });
});
