export type ReferenceStatus = "proposed" | "approved" | "rejected";

export interface ReferenceSourceRecord {
  id: string;
  projectId: string;
  title: string;
  description: string;
  query: string;
  sourceUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  notes: string;
  tags: string[];
  status: ReferenceStatus;
  createdAt: string;
  updatedAt: string;
}
export type ReferenceSearchResult = Omit<ReferenceSourceRecord, "id" | "projectId" | "notes" | "tags" | "status" | "createdAt" | "updatedAt">;

const plain = (value: unknown): string => typeof value === "string"
  ? value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim()
  : "";
const EXPLICIT_REFERENCE_SEARCH = /\b(?:search|find|fetch|show(?: me)?|look for|pull up|gather|collect)\b[\s\S]{0,140}\b(?:wikimedia commons|reference(?: images?)?|visual references?|images?|photos?|pictures?)\b/i;

/** Only explicit lookup requests reach the network; ordinary story discussion stays in chat. */
export function extractReferenceSearchQuery(message: string): string | undefined {
  const text = message.normalize("NFKC").trim();
  if (!text || !EXPLICIT_REFERENCE_SEARCH.test(text)) return undefined;
  const query = text
    .replace(/^\s*(?:please\s+)?(?:can you\s+|could you\s+)?/i, "")
    .replace(/^\s*(?:search(?:\s+(?:for|the web for))?|find(?:\s+me)?|fetch|show(?:\s+me)?|look\s+for|pull\s+up|gather|collect)\s+/i, "")
    .replace(/\b(?:wikimedia commons|reference\s+images?|visual\s+references?|references?|images?|photos?|pictures?|visuals?)\b/gi, " ")
    .replace(/^\s*(?:of|for|about|showing|featuring|on|to find|with)\s+/i, "")
    .replace(/\b(?:please|thanks|thank you|could you|can you|for me)\b/gi, " ")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return query.length >= 2 ? query : undefined;
}

const safeHttps = (value: unknown): string => {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; }
  catch { return ""; }
};

function safeWikimediaUrl(value: unknown, expectedHost: "commons.wikimedia.org" | "upload.wikimedia.org"): string {
  const safe = safeHttps(value);
  if (!safe) return "";
  try {
    const url = new URL(safe);
    return url.hostname.toLowerCase() === expectedHost && !url.username && !url.password && !url.port
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

/** Validate persisted search cards before rendering external images from local chat history. */
export function normalizeReferenceSearchResults(value: unknown): ReferenceSearchResult[] {
  if (!Array.isArray(value)) return [];
  const results: ReferenceSearchResult[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const sourceUrl = safeWikimediaUrl(item.sourceUrl, "commons.wikimedia.org");
    const imageUrl = safeWikimediaUrl(item.imageUrl, "upload.wikimedia.org");
    const thumbnailUrl = safeWikimediaUrl(item.thumbnailUrl, "upload.wikimedia.org");
    const rawLicenseUrl = typeof item.licenseUrl === "string" ? item.licenseUrl.trim() : "";
    const licenseUrl = rawLicenseUrl ? safeHttps(rawLicenseUrl) : "";
    if (!sourceUrl || !imageUrl || !thumbnailUrl || (rawLicenseUrl && !licenseUrl)
      || typeof item.title !== "string" || !item.title.trim()
      || typeof item.description !== "string" || typeof item.query !== "string"
      || typeof item.creator !== "string" || typeof item.license !== "string"
      || typeof item.attribution !== "string") continue;
    results.push({
      title: item.title.slice(0, 300),
      description: item.description.slice(0, 1800),
      query: item.query.slice(0, 180),
      sourceUrl,
      imageUrl,
      thumbnailUrl,
      creator: item.creator.slice(0, 500),
      license: item.license.slice(0, 300),
      licenseUrl,
      attribution: item.attribution.slice(0, 800),
    });
  }
  return results;
}

export function parseWikimediaSearchResponse(payload: unknown, query: string): ReferenceSearchResult[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { query?: { pages?: Record<string, unknown> } };
  const pages = root.query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const results: ReferenceSearchResult[] = [];
  for (const raw of Object.values(pages)) {
    if (!raw || typeof raw !== "object") continue;
    const page = raw as { title?: unknown; imageinfo?: Array<{ url?: unknown; thumburl?: unknown; descriptionurl?: unknown; extmetadata?: Record<string, { value?: unknown }> }> };
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const imageUrl = safeWikimediaUrl(info.url, "upload.wikimedia.org");
    const sourceUrl = safeWikimediaUrl(info.descriptionurl, "commons.wikimedia.org");
    const thumbnailUrl = safeWikimediaUrl(info.thumburl, "upload.wikimedia.org") || imageUrl;
    if (!imageUrl || !sourceUrl || !thumbnailUrl) continue;
    const meta = info.extmetadata ?? {};
    results.push({
      title: plain(page.title).replace(/^File:/i, "") || "Untitled reference",
      description: plain(meta.ImageDescription?.value),
      query: query.trim(),
      sourceUrl, imageUrl, thumbnailUrl,
      creator: plain(meta.Artist?.value) || "Creator not listed",
      license: plain(meta.LicenseShortName?.value) || "License not identified — review source page",
      licenseUrl: safeHttps(plain(meta.LicenseUrl?.value)),
      attribution: plain(meta.AttributionRequired?.value) || "Check source page for attribution requirements",
    });
  }
  return results;
}

/** Searches Wikimedia Commons directly. The user's query is sent to Wikimedia; project data is not. */
export async function searchWikimediaCommons(query: string, signal?: AbortSignal): Promise<ReferenceSearchResult[]> {
  const normalized = query.trim().slice(0, 180);
  if (normalized.length < 2) throw new Error("Enter at least two characters to search for references.");
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: "filetype:bitmap " + normalized,
    gsrnamespace: "6",
    gsrlimit: "18",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "480",
    format: "json",
    origin: "*",
  });
  const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Wikimedia Commons search failed (HTTP " + response.status + ").");
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error("Wikimedia Commons returned an unreadable search response."); }
  return parseWikimediaSearchResponse(payload, normalized);
}

export function validateReferenceSource(value: unknown, projectId?: string): string[] {
  if (!value || typeof value !== "object") return ["Reference source must be an object."];
  const record = value as Partial<ReferenceSourceRecord>;
  const errors: string[] = [];
  if (typeof record.id !== "string" || !record.id.trim()) errors.push("A reference needs an ID.");
  if (typeof record.projectId !== "string" || !record.projectId.trim()) errors.push("A reference needs a project ID.");
  if (projectId && record.projectId !== projectId) errors.push("Reference belongs to a different project.");
  for (const key of ["title", "description", "query", "creator", "license", "licenseUrl", "attribution", "notes"] as const) {
    if (typeof record[key] !== "string") errors.push("Reference field " + key + " must be text.");
  }
  for (const key of ["sourceUrl", "imageUrl", "thumbnailUrl"] as const) {
    if (!safeHttps(record[key])) errors.push("Reference field " + key + " must be a valid HTTPS URL.");
  }
  if (record.licenseUrl && !safeHttps(record.licenseUrl)) errors.push("Reference license URL must use HTTPS.");
  if (!Array.isArray(record.tags) || record.tags.some(tag => typeof tag !== "string")) errors.push("Reference tags must be a list of text values.");
  if (!["proposed", "approved", "rejected"].includes(record.status ?? "")) errors.push("Reference status is invalid.");
  if (typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") errors.push("Reference timestamps are required.");
  return [...new Set(errors)];
}

export type ApprovedReferenceImage = Pick<ReferenceSourceRecord, "title" | "imageUrl" | "sourceUrl" | "license" | "creator" | "notes">;

/**
 * Return a small set of relevant, explicitly approved Commons images for vision-capable
 * drawing requests. Do not attach arbitrary HTTPS URLs imported into a project package.
 */
export function selectApprovedReferenceImages(
  records: ReferenceSourceRecord[],
  projectId: string,
  userMessage: string,
  maxImages = 2,
): ApprovedReferenceImage[] {
  const max = Math.max(0, Math.min(4, Math.floor(maxImages)));
  if (!max) return [];
  const terms = userMessage.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
  return records.filter(record => {
    if (record.status !== "approved" || validateReferenceSource(record, projectId).length) return false;
    let image: URL;
    try { image = new URL(record.imageUrl); } catch { return false; }
    if (image.protocol !== "https:" || image.hostname.toLocaleLowerCase() !== "upload.wikimedia.org" || image.username || image.password) return false;
    const haystack = (record.title + " " + record.description + " " + record.query + " " + record.notes + " " + record.tags.join(" ")).toLocaleLowerCase();
    return !terms.length || terms.some(term => haystack.includes(term));
  }).slice(0, max).map(record => ({
    title: record.title,
    imageUrl: record.imageUrl,
    sourceUrl: record.sourceUrl,
    license: record.license,
    creator: record.creator,
    notes: record.notes,
  }));
}

export function buildReferenceContext(records: ReferenceSourceRecord[], projectId: string, userMessage: string, maxCharacters = 3000): string {
  const relevant = records.filter(record => {
    const errors = validateReferenceSource(record, projectId);
    if (errors.length) throw new Error("Saved reference validation failed: " + errors.join(" "));
    if (record.status !== "approved") return false;
    const haystack = (record.title + " " + record.description + " " + record.query + " " + record.notes + " " + record.tags.join(" ")).toLocaleLowerCase();
    const terms = userMessage.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 2);
    return !terms.length || terms.some(term => haystack.includes(term));
  }).slice(0, 10);
  if (!relevant.length) return "";
  const lines = [
    "PROJECT REFERENCE LIBRARY — USER-APPROVED SOURCE METADATA",
    "These are approved reference records. Use their descriptions and notes as source metadata only; visual inspection is grounded only when an approved image URL is separately attached as an image part to the current request; source metadata alone is never evidence that pixels were inspected.",
    "Respect each source's license and attribution terms. A saved reference is visual inspiration, not permission to copy protected characters, panels, or signature designs.",
  ];
  for (const record of relevant) lines.push("- " + record.title + " | " + record.notes + " | Source: " + record.sourceUrl + " | License: " + record.license + (record.creator ? " | Creator: " + record.creator : ""));
  const limit = Math.max(500, Math.min(8000, Math.floor(maxCharacters)));
  let context = lines.join("\n");
  if (context.length > limit) context = context.slice(0, limit - 28).trimEnd() + "\n[Reference context truncated.]";
  return context;
}
