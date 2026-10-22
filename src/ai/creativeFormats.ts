export type CreativeFormatId =
  | "webtoon"
  | "manga"
  | "doujin"
  | "one-shot"
  | "comic-strip"
  | "graphic-novel"
  | "comic-page"
  | "visual-novel"
  | "storyboard"
  | "picture-book"
  | "custom-storyboard"
  | "illustrated-story";

export type CreativeLayout = "vertical-strip" | "page" | "horizontal-strip" | "wide-scene" | "square-spread";

export interface CreativeProductionSpec {
  id: CreativeFormatId;
  label: string;
  layout: CreativeLayout;
  width: number;
  height: number;
  foundationGate: boolean;
  promptGuidance: string;
}

const FORMAT_SPECS: Record<CreativeFormatId, CreativeProductionSpec> = {
  webtoon: {
    id: "webtoon", label: "Webtoon", layout: "vertical-strip", width: 900, height: 6000, foundationGate: true,
    promptGuidance: "WEBTOON VERTICAL-SCROLL PRODUCTION: Compose for continuous vertical phone reading, with varied panel heights, deliberate whitespace/gutters, changing shot distance, safe text margins, and clear top-to-bottom pacing. Use compact, readable storyboard thumbnails first. Keep each batch to 2–4 new panels and preserve room for later refinement.",
  },
  manga: {
    id: "manga", label: "Manga page", layout: "page", width: 1800, height: 2700, foundationGate: true,
    promptGuidance: "MANGA PAGE PRODUCTION: Compose a single editable portrait page with 2–5 clearly separated panels, readable gutters, intentional close-up/wide-shot rhythm, and speech/caption areas. Respect an explicit reading-direction instruction; otherwise use right-to-left only when the user has clearly asked for Japanese-style manga. Start with rough composition and gesture, not fake finished line art.",
  },
  doujin: {
    id: "doujin", label: "Doujin comic page", layout: "page", width: 1800, height: 2700, foundationGate: true,
    promptGuidance: "DOUJIN / FAN-CREATED COMIC PRODUCTION: Treat this as a creator-led standalone or fan-created comic page. Follow the user's named characters and universe, mark assumptions instead of inventing canon, and create an original composition rather than tracing or replicating existing pages. Use 2–5 editable panels, clear gutters, and room for lettering.",
  },
  "one-shot": {
    id: "one-shot", label: "Short one-shot", layout: "vertical-strip", width: 900, height: 6000, foundationGate: true,
    promptGuidance: "SHORT ONE-SHOT PRODUCTION: Plan a compact, self-contained story with a clear setup, meaningful turn, and satisfying resolution. Use economical visual beats and only the essential cast. Build a readable vertical storyboard in small batches; never claim a full one-shot is finished after its first thumbnail batch.",
  },
  "comic-strip": {
    id: "comic-strip", label: "Comic strip", layout: "horizontal-strip", width: 2400, height: 1200, foundationGate: true,
    promptGuidance: "COMIC STRIP PRODUCTION: Use a horizontal strip, normally 3–4 panels, with a clear setup, escalation or turn, and punchline/payoff. Preserve consistent character silhouettes and enough white space for readable lettering. Do not use a vertical Webtoon layout unless the user specifically asks for it.",
  },
  "graphic-novel": {
    id: "graphic-novel", label: "Graphic novel page", layout: "page", width: 1800, height: 2700, foundationGate: true,
    promptGuidance: "GRAPHIC-NOVEL PAGE PRODUCTION: Use an intentional portrait page and cinematic panel rhythm, varying scale and negative space to support emotion and clarity. Do not assume manga conventions unless requested. Create an editable rough board first, with safe areas reserved for dialogue and narration.",
  },
  "comic-page": {
    id: "comic-page", label: "Comic page", layout: "page", width: 1800, height: 2700, foundationGate: true,
    promptGuidance: "COMIC PAGE PRODUCTION: Create one editable portrait page with a coherent grid or deliberately varied panel shapes, readable gutters, strong focal hierarchy, and space for dialogue/captions. Respect the requested reading direction and genre rather than forcing one house style.",
  },
  "visual-novel": {
    id: "visual-novel", label: "Visual novel scene board", layout: "wide-scene", width: 1600, height: 900, foundationGate: true,
    promptGuidance: "VISUAL-NOVEL SCENE BOARD: Compose a wide 16:9 scene with a clear background/environment, character staging and eye-lines, expression/pose cues, and a separate reserved dialogue-box area. This is an editable scene/layout storyboard, not a playable game or a finished character sprite. Keep speaker and dialogue details grounded in approved story context.",
  },
  storyboard: {
    id: "storyboard", label: "Storyboard", layout: "page", width: 1800, height: 2700, foundationGate: true,
    promptGuidance: "STORYBOARD / SHOT-SEQUENCE PRODUCTION: Use an editable thumbnail grid with clear shot order, varied camera distance/angle, action direction, and brief shot labels only when useful. Favor readability and staging over polish. Keep each batch coherent and preserve previous approved shots.",
  },
  "picture-book": {
    id: "picture-book", label: "Illustrated picture-book spread", layout: "square-spread", width: 1800, height: 1800, foundationGate: true,
    promptGuidance: "PICTURE-BOOK SPREAD PRODUCTION: Compose a square spread with one clear illustration focal point and generous reserved space for readable narration. Follow the user's audience and tone. Keep character appearance and setting consistent across spreads; treat the result as editable layout/storyboard work, not finished publishing art.",
  },
  "custom-storyboard": {
    id: "custom-storyboard", label: "Custom creative format", layout: "page", width: 1600, height: 1200, foundationGate: true,
    promptGuidance: "CUSTOM CREATIVE FORMAT: Follow the user's explicitly described medium, visual language, pacing, page/strip direction, panel density, text treatment, and intended audience. Do not force manga, Webtoon, comic-page, or any other convention when the brief requests something different. Use this editable 1600×1200 storyboard surface as a provisional starting point only; honor any specific layout or dimensions requested if the canvas supports them, and state any unsupported output clearly.",
  },
  "illustrated-story": {
    id: "illustrated-story", label: "Flexible illustrated story", layout: "vertical-strip", width: 900, height: 6000, foundationGate: true,
    promptGuidance: "FLEXIBLE ILLUSTRATED-STORY PRODUCTION: The user did not specify a fixed comic tradition. Follow their requested medium, genre, tone, reading direction, panel density, and pacing; do not assume all stories are manga. Start with an editable storyboard and use small verified batches. Ask for a format choice only if a material decision cannot be safely inferred.",
  },
};

const FORMAT_MATCHERS: Array<{ id: CreativeFormatId; pattern: RegExp }> = [
  { id: "webtoon", pattern: /\b(?:web[\s-]?toon|vertical\s+(?:scroll|scrolling)\s+comic|scrolling\s+comic)\b/i },
  { id: "doujin", pattern: /\b(?:doujin(?:shi)?|fan[\s-]?comic|fan[\s-]?manga)\b/i },
  { id: "one-shot", pattern: /\b(?:one[\s-]?shot|oneshot|standalone\s+(?:short\s+)?(?:comic|manga|story))\b/i },
  { id: "comic-strip", pattern: /\b(?:comic\s+strip|(?:three|four|3|4)[\s-]panel\s+(?:comic|strip)|4[\s-]koma)\b/i },
  { id: "graphic-novel", pattern: /\bgraphic\s+novel\b/i },
  { id: "visual-novel", pattern: /\bvisual\s+novel\b/i },
  { id: "picture-book", pattern: /\b(?:picture\s+book|illustrated\s+children'?s\s+book)\b/i },
  { id: "custom-storyboard", pattern: /\b(?:custom|hybrid|experimental)\s+(?:visual\s+)?(?:story|comic|format|sequence|narrative|book|storyboard)\b/i },
  { id: "storyboard", pattern: /\b(?:storyboard|animatic\s+board|shot\s+sequence|short\s+film\s+board|film\s+storyboard)\b/i },
  { id: "manga", pattern: /\b(?:manga|manga\s+page)\b/i },
  { id: "comic-page", pattern: /\b(?:comic\s+page|comic\s+book|graphic\s+comic)\b/i },
];

const STRONG_PRODUCTION_ACTION = /\b(?:write|draft|compose|script|create|make|build|produce|generate|draw|sketch|illustrate|paint|render|storyboard|plan|outline|start|begin|turn\s+.+\s+into|adapt\s+.+\s+into)\b/i;
const IDEATION_ONLY = /^\s*(?:(?:please|let['’]s|can\s+you|could\s+you|help\s+me)\s+)?(?:brainstorm|research|discuss|talk\s+(?:about|through)|explore\s+ideas|look\s+for\s+(?:references|sources)|find\s+(?:references|sources)|collect\s+references|compare|explain|analy[sz]e|give\s+me\s+ideas|show\s+me\s+references|what\s+are\s+some)\b/i;
const DEFERRED_PRODUCTION = /\b(?:don't|do\s+not|never|not\s+yet|hold\s+off\s+on|wait\s+to|no\s+need\s+to|let's\s+not)\b[\s\S]{0,100}?\b(?:write|draft|compose|create|make|build|produce|generate|draw|sketch|illustrate|paint|render|storyboard|plan|outline|start|begin)\b/i;

/**
 * Detect only an explicit request to produce a named visual-story format.
 * Discussion, inspiration research, and brainstorming remain ordinary chat.
 */
export function detectCreativeProductionRequest(message: string): CreativeProductionSpec | undefined {
  const text = message.normalize("NFKC").trim();
  if (!text) return undefined;
  const deferred = DEFERRED_PRODUCTION.exec(text);
  if (deferred) {
    const remainder = text.slice(deferred.index + deferred[0].length);
    const positiveClause = remainder.match(/\b(?:but|instead|however|actually)\b([\s\S]{0,180})/i)?.[1] ?? "";
    if (!positiveClause || !STRONG_PRODUCTION_ACTION.test(positiveClause)) return undefined;
  }

  if (!STRONG_PRODUCTION_ACTION.test(text) || IDEATION_ONLY.test(text)) return undefined;

  const matched = FORMAT_MATCHERS.find(item => item.pattern.test(text));
  if (!matched) return undefined;

  // A user who is discussing a work but not asking for a deliverable stays in chat.
  const asksForDeliverable = /\b(?:chapter|episode|scene|page|panel|strip|comic|manga|doujin(?:shi)?|web[\s-]?toon|one[\s-]?shot|oneshot|graphic\s+novel|visual\s+novel|picture\s+book|storyboard|animatic|short\s+story|custom\s+format|custom|hybrid|experimental|narrative|story|format)\b/i.test(text);
  if (!asksForDeliverable) return undefined;
  return FORMAT_SPECS[matched.id];
}

/** Default for explicit chapter production when no particular tradition was specified. */
export const DEFAULT_ILLUSTRATED_STORY: CreativeProductionSpec = FORMAT_SPECS["illustrated-story"];

export function getCreativeFormatSpec(id: CreativeFormatId): CreativeProductionSpec {
  return FORMAT_SPECS[id];
}

export type CreativeFormatChoice = "auto" | CreativeFormatId;

/** An explicit picker choice affects production only; Auto leaves routing to the user's request. */
export function resolveCreativeFormatChoice(choice: CreativeFormatChoice): CreativeProductionSpec | undefined {
  return choice === "auto" ? undefined : FORMAT_SPECS[choice];
}

export function describeCreativeFormats(): string {
  return [
    "Webtoon / vertical-scroll comic",
    "Manga pages",
    "Doujin and fan-created comics",
    "Short one-shots",
    "Comic strips (including 3–4 panel strips)",
    "Graphic novels and general comic pages",
    "Visual-novel scene boards",
    "Storyboards / shot sequences",
    "Illustrated picture-book spreads",
    "A flexible custom illustrated-story default",
  ].join(" · ");
}
