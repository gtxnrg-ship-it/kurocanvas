/**
 * Request-aware response depth for Kuro.
 *
 * This is a prompt/output-budget hint, not a guarantee about a provider's
 * reasoning capacity. Hosted providers can usually spend more output tokens;
 * the experimental browser-local model remains deliberately bounded.
 */
export type KuroResponseDepth = "quick" | "balanced" | "deep" | "exhaustive";

const LOCAL_OUTPUT_LIMIT_NOTICE = "Kuro reached the configured reply budget";
const QUICK_REQUEST = /\b(?:quick(?:ly)?|brief(?:ly)?|short answer|one sentence|in a sentence|tl;?dr|just the answer|no explanation)\b/i;
const CONTINUATION_REQUEST = /\b(?:continue|keep going|go on|carry on|finish (?:it|that|this|the answer)|pick up where you left off|expand on that|tell me more)\b/i;
const DEEP_REQUEST = /\b(?:detailed|in detail|thorough(?:ly)?|deep dive|walk me through|explain how|how exactly|step by step|compare|brainstorm|worldbuild(?:ing)?|develop|design|architecture|implementation|debug|review|critique|write|draft|outline|chapter|scene|story|universe|world|every single|all of|full(?:y)?|complete|exhaustive|comprehensive|possibilities|alternatives|different ways|how it could play out|continuity|foreshadow|easter egg|cameo)\b/i;
const HUGE_REQUEST = /\b(?:exhaustive|comprehensive|every single detail|leave nothing out|full specification|production[- ]ready|fully finish|end to end|entire system|all edge cases)\b/i;
const CREATIVE_FORMAT_REQUEST = /\\b(?:write|draft|make|create|plan|outline|develop|produce|script|storyboard|design)\\b.{0,80}\\b(?:manga|doujin|manhua|webtoon|comics?|panel(?:s| script)?|page[- ]by[- ]page)\\b/i;

/** Exact composer text used by Kuro's visible Continue answer control. */
export const KURO_CONTINUE_ANSWER_PROMPT =
  "Continue from the last unfinished point. Do not repeat the sections already completed.";

/**
 * Recover the substantive user request behind repeated UI continuation turns.
 * This prevents each Continue click from replacing the original creative brief
 * with the generic one-line continuation instruction.
 */
export function findKuroContinuationSource(
  messages: readonly { role: string; text: string }[],
  beforeIndex: number,
): string | undefined {
  const earlierUserMessages = messages.slice(0, Math.max(0, beforeIndex))
    .filter(message => message.role === "user");
  return [...earlierUserMessages].reverse()
    .find(message => message.text.trim() !== KURO_CONTINUE_ANSWER_PROMPT)?.text;
}

/** Bound the hidden source attached to a continuation without losing premise or ending constraints. */
export function boundKuroContinuationSource(value: string, maxChars = 4000): string {
  if (value.length <= maxChars) return value;
  const marker = "\n[…middle of original request omitted…]\n";
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available * 0.6);
  const tail = available - head;
  return value.slice(0, head) + marker + (tail ? value.slice(-tail) : "");
}


export function inferKuroResponseDepth(message: string): KuroResponseDepth {
  const text = message.trim();
  if (!text || /^(?:hi|hey|hello|thanks|thank you|ok|okay|yes|no|lol|haha)[!.\s]*$/i.test(text)) return "quick";
  // Strong requests for a comprehensive treatment outrank a generic "brief" token.
  if (HUGE_REQUEST.test(text)) return "exhaustive";
  if (QUICK_REQUEST.test(text) && text.length < 500 && !DEEP_REQUEST.test(text)) return "quick";
  if (CONTINUATION_REQUEST.test(text)) return "deep";
  if (DEEP_REQUEST.test(text) || CREATIVE_FORMAT_REQUEST.test(text) || text.length >= 420 || (text.match(/[?;]/g)?.length ?? 0) >= 3) return "deep";
  return "balanced";
}

export function getKuroResponseQualityGuidance(message: string): string {
  const depth = inferKuroResponseDepth(message);
  const continuationRequested = CONTINUATION_REQUEST.test(message.trim());
  const continuationInstruction = continuationRequested
    ? "CONTINUATION REQUEST: The user is asking you to continue the immediately preceding assistant answer. Use the recent conversation as the source of where it stopped. Continue from the last unfinished point; do not restart the topic, repeat the finished sections, or write a new introduction. Preserve the existing structure and constraints, and complete any unfinished list, code block, or explanation."
    : "When a user asks for a revision or follow-up, apply it to the active subject and preserve the already established constraints unless they explicitly change them.";
  const depthInstruction: Record<KuroResponseDepth, string> = {
    quick: "Use a direct, natural answer. Do not inflate a simple exchange into an essay.",
    balanced: "Give a complete, helpful answer with the key reasoning and a useful example when it adds value.",
    deep: "Give a substantial, carefully developed answer. Explain the meaningful reasoning, concrete options, examples, implications, and next steps. Do not compress a complex request into a shallow paragraph.",
    exhaustive: "Treat this as a comprehensive deliverable. Work through the major components, dependencies, alternatives, edge cases, verification needs, and limitations. Be expansive and specific without repeating yourself or claiming unfinished work is complete.",
  };
  return [
    "KURO RESPONSE QUALITY CONTRACT",
    "Interpret the user's intended meaning, not merely literal keywords. Their English may be fragmented, informal, misspelled, or grammatically imperfect; do not correct it or demand polished prompts unless they ask. Use the conversation and project context to infer intent generously. Ask one focused question only when a material ambiguity would change the result; otherwise state a reasonable assumption and proceed.",
    "Understand before answering: connect the request to relevant earlier decisions, preserve named details and emotional nuance, and address every important part of a multi-part request. Do not bluff, falsely claim certainty, or ask the user to repeat information already available.",
    continuationInstruction,
    "COLLABORATIVE CONVERSATION: Treat brainstorming as a real back-and-forth, not a form to fill out or a deliverable to prematurely formalize. Build directly on the user's latest thought, contribute a few specific ideas or trade-offs, and leave room for them to react. Do not mistake an unfinished idea for a request to produce a complete framework, checklist, or world bible. When the user is still exploring, help discover what they mean before locking decisions. When corrected, acknowledge the precise miss, update your understanding, and move forward without defending the previous answer.",
    "CONTEXTUAL UNDERSTANDING: Resolve pronouns, shorthand, references such as “that thing” or “the whole system,” and implied contrasts using the available conversation and project records. Prefer the interpretation that best fits the whole exchange, not just the latest sentence in isolation. If multiple interpretations remain materially plausible, briefly name the uncertainty rather than confidently answering the wrong question.",
    "Answer the actual request first, then develop it at the depth it deserves. Prefer meaningful explanation, examples, trade-offs, alternate possibilities, and practical follow-through over generic enthusiasm, filler, or repeated conclusions. The user values substantial detail for creative and technical work; do not default to an artificially short answer for a complex discussion.",
    "For story creation, consider motivation, subtext, dialogue, pacing, consequences, physical continuity, setting details, visual readability, recurring motifs, foreshadowing, callbacks, Easter eggs, subtle cameos, and future payoffs when relevant. Keep author-only planning distinct from what readers should see at that point in the story. An intentionally requested cameo or clue is not an accidental continuity error; preserve its intended subtlety and do not expose a secret identity on-page unless the author asks.",
    "Keep suggestions separate from approved canon. Offer multiple genuinely distinct directions when the user is exploring possibilities; explain what each option changes and why it may work. Do not turn every response into a list if conversational prose is clearer.",
    "MANGA/DOUJIN PRODUCTION: Follow the creator's requested stage instead of jumping ahead: brainstorm, premise, character sheets, outline, page breakdown, panel script, dialogue polish, continuity pass, or revision. For a manga/doujin/webtoon panel script, number pages and panels and include only the production details useful for each panel: framing/camera, visible action and expression, dialogue, captions, SFX, and transitions or page-turn reveals where they matter. Make dialogue sound speakable, vary panel density and visual rhythm, preserve the requested page count and reading direction, and let the art carry information that does not need redundant narration. For fan works, preserve the supplied canon characterization unless the creator requests an alternate universe or deliberate divergence; keep established facts, proposed changes, and unknowns distinct. Do not turn exploratory brainstorming into a locked outline or silently declare new canon.",
    "Use readable Markdown as part of the conversation, not as decoration: use short descriptive headings for substantial multi-part answers, bullets or numbered steps when they improve scanning, tables for actual comparisons, fenced code blocks for code, and bold labels for key concepts. Keep simple replies conversational and avoid a heading on every paragraph. Do not emit raw HTML; render links as ordinary HTTPS URLs or Markdown links and never imply an image was fetched or viewed unless the app confirms it.",
    "Depth target for this request (" + depth + "): " + depthInstruction[depth],
  ].join("\n");
}

/**
 * Choose an output ceiling from the request's demonstrated complexity.
 * This changes only the requested budget; provider/model limits still apply.
 */
export function getKuroResponseTokenBudget(message: string, providerId?: string): number {
  const depth = inferKuroResponseDepth(message);
  const hostedBudget: Record<KuroResponseDepth, number> = {
    quick: 900,
    balanced: 2000,
    deep: 3800,
    exhaustive: 6000,
  };
  // Keep lightweight replies quick, while allowing full scene plans and
  // continuity extraction up to the local runtime's declared hard cap.
  if (providerId === "kuro-local-browser") {
    // These are total reply budgets. The local generation harness emits bounded
    // 1,024-token passes and continues automatically when a pass hits its ceiling.
    const localBudget: Record<KuroResponseDepth, number> = {
      quick: 256,
      balanced: 2048,
      deep: 8192,
      exhaustive: 12288,
    };
    return localBudget[depth];
  }
  return hostedBudget[depth];
}


/**
 * Turn model finish metadata into honest user-facing chat text.
 * Structured-output callers still validate/recover JSON with their own schema.
 */
export function isKuroChatResponseTruncated(text: string): boolean {
  return text.includes(LOCAL_OUTPUT_LIMIT_NOTICE);
}

export function formatKuroChatResponse(
  text: string,
  finishReason: "stop" | "length" | "cancelled" | "error",
): string {
  const content = text.trim();
  if (!content) return "The model returned an empty response. Please try again.";
  if (finishReason === "length") {
    return content + "\n\n*" + LOCAL_OUTPUT_LIMIT_NOTICE + ", so this reply may be incomplete. Say “continue” and I'll carry on from here.*";
  }
  if (finishReason === "error") {
    return content + "\n\n*This response ended with a model error and may be incomplete.*";
  }
  return content;
}
