import { useEffect, useState } from "react";
import { ExternalLink, ImagePlus } from "lucide-react";
import { referenceSourceStorage } from "../core/storage";
import type { ReferenceSearchResult, ReferenceSourceRecord } from "./referenceScout";

export function safeWikimediaThumbnailUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "upload.wikimedia.org"
      || url.username || url.password || url.port) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export default function InlineReferenceResults({
  projectId,
  results,
}: {
  projectId: string;
  results: ReferenceSearchResult[];
}) {
  const [savedSources, setSavedSources] = useState<Set<string>>(() => new Set());
  const [savingSource, setSavingSource] = useState("");
  const [status, setStatus] = useState("");
  const [imageStates, setImageStates] = useState<Record<string, "loading" | "loaded" | "error">>(
    () => Object.fromEntries(results.map(result => [result.sourceUrl, "loading"])),
  );

  useEffect(() => {
    setImageStates(Object.fromEntries(results.map(result => [result.sourceUrl, "loading"])));
  }, [results]);

  useEffect(() => {
    let alive = true;
    if (!projectId) {
      setSavedSources(new Set());
      return () => { alive = false; };
    }
    void referenceSourceStorage.list(projectId).then(records => {
      if (alive) setSavedSources(new Set(records.map(record => record.sourceUrl)));
    }).catch(error => {
      if (alive) setStatus(error instanceof Error ? error.message : "Could not check the project's reference library.");
    });
    return () => { alive = false; };
  }, [projectId]);

  async function saveAsProposal(result: ReferenceSearchResult) {
    if (!projectId) {
      setStatus("Choose a project before saving a visual reference.");
      return;
    }
    if (savedSources.has(result.sourceUrl)) {
      setStatus("This source is already saved in the project reference library.");
      return;
    }
    const timestamp = new Date().toISOString();
    const record: ReferenceSourceRecord = {
      ...result,
      id: crypto.randomUUID(),
      projectId,
      notes: "",
      tags: [],
      status: "proposed",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setSavingSource(result.sourceUrl);
    setStatus("");
    try {
      await referenceSourceStorage.save(record);
      setSavedSources(current => new Set([...current, result.sourceUrl]));
      setStatus("Saved as a proposal. Review the source, creator attribution, and license in Reference Scout before approving it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save this reference.");
    } finally {
      setSavingSource("");
    }
  }

  return <section className="inline-reference-results" aria-label="Visual reference search results">
    <header className="inline-reference-head">
      <div><strong>Visual references</strong><small>Wikimedia Commons · source and license shown per result</small></div>
      <span>{results.length} found</span>
    </header>
    <div className="inline-reference-grid">
      {results.slice(0, 12).map((result, index) => {
        const thumbnail = safeWikimediaThumbnailUrl(result.thumbnailUrl);
        const saved = savedSources.has(result.sourceUrl);
        return <article className="inline-reference-card" key={result.sourceUrl + "-" + index}>
          <a className="inline-reference-image" href={result.sourceUrl} target="_blank" rel="noreferrer noopener" aria-label={"Open source page for " + result.title}>
            {thumbnail
              ? <>
                  <img
                    src={thumbnail}
                    alt={imageStates[result.sourceUrl] === "error" ? result.title + " (thumbnail unavailable)" : result.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={() => setImageStates(current => ({ ...current, [result.sourceUrl]: "loaded" }))}
                    onError={() => setImageStates(current => ({ ...current, [result.sourceUrl]: "error" }))}
                  />
                  {imageStates[result.sourceUrl] !== "loaded" && <span className={"inline-reference-image-status" + (imageStates[result.sourceUrl] === "error" ? " is-error" : "")} aria-hidden="true"}>
                    {imageStates[result.sourceUrl] === "error" ? "Image unavailable" : "Fetching image…"}
                  </span>}
                </>
              : <span><ImagePlus size={24} /> Thumbnail unavailable</span>}
          </a>
          <div className="inline-reference-detail">
            <a className="inline-reference-title" href={result.sourceUrl} target="_blank" rel="noreferrer noopener">{result.title}<ExternalLink size={12} /></a>
            {result.description && <p>{result.description}</p>}
            <dl>
              <div><dt>Creator</dt><dd>{result.creator || "Creator not listed"}</dd></div>
              <div><dt>License</dt><dd>{result.license || "Review source page"}</dd></div>
              <div><dt>Attribution</dt><dd>{result.attribution || "Check source page"}</dd></div>
            </dl>
            <div className="inline-reference-actions">
              <a href={result.licenseUrl || result.sourceUrl} target="_blank" rel="noreferrer noopener">Review license</a>
              <button type="button" disabled={!projectId || busyOrSaved(saved, savingSource, result.sourceUrl)} onClick={() => void saveAsProposal(result)}>
                {saved ? "Saved · proposed" : savingSource === result.sourceUrl ? "Saving…" : "Save proposal"}
              </button>
            </div>
          </div>
        </article>;
      })}
    </div>
    <p className="inline-reference-note">{projectId
      ? "These are real source-linked search results, not images generated by Kuro. Saving adds a proposal to this project's library; it does not approve the material or its license."
      : "These are real source-linked search results, not images generated by Kuro. Choose or create a project to save any result as a proposal."}</p>
    {status && <p className="inline-reference-status" role="status">{status}</p>}
  </section>;
}

function busyOrSaved(saved: boolean, savingSource: string, sourceUrl: string): boolean {
  return saved || savingSource === sourceUrl || Boolean(savingSource);
}
