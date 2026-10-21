const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90,
  hundredth: 100, thousandth: 1000, millionth: 1_000_000,
};

function parseEnglishNumber(phrase: string): number | undefined {
  const tokens = phrase.toLocaleLowerCase().replace(/-/g, " ").split(/\s+/).filter(token => token && token !== "and");
  if (!tokens.length) return undefined;
  if (tokens.length === 1 && ORDINALS[tokens[0]] !== undefined) return ORDINALS[tokens[0]];
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (SMALL[token] !== undefined) current += SMALL[token];
    else if (TENS[token] !== undefined) current += TENS[token];
    else if (token === "hundred") current = (current || 1) * 100;
    else if (token === "thousand" || token === "million") {
      const scale = token === "thousand" ? 1000 : 1_000_000;
      total += (current || 1) * scale;
      current = 0;
    } else return undefined;
  }
  return total + current;
}

/**
 * Resolve explicit chapter coordinates from digits or ordinary English number words.
 * This lets recall work for messages such as "what happened in chapter two?" without
 * interpreting unrelated numbers elsewhere in the prompt as a chapter.
 */
export function parseStoryChapterNumber(message: string): number | undefined {
  const numeric = message.match(/\b(?:chapter|ch\.?)\s*#?\s*(\d{1,7})(?:st|nd|rd|th)?\b/i);
  if (numeric) {
    const value = Number(numeric[1]);
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  const ordinal = message.match(/\b(?:chapter|ch\.?)\s*#?\s*(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth|millionth)\b/i);
  if (ordinal) return ORDINALS[ordinal[1].toLocaleLowerCase()];
  const words = message.match(/\b(?:chapter|ch\.?)\s*#?\s*([a-z]+(?:[\s-]+[a-z]+){0,8})\b/i);
  if (!words) return undefined;
  const tokens = words[1].replace(/-/g, " ").split(/\s+/);
  for (let count = tokens.length; count > 0; count--) {
    const value = parseEnglishNumber(tokens.slice(0, count).join(" "));
    if (value !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) return value;
  }
  return undefined;
}
