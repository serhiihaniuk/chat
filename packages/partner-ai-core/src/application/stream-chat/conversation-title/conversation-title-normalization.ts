const TITLE_MAX_WORDS = 6;
const TITLE_MIN_WORDS = 2;
const TITLE_MAX_LENGTH = 64;

/**
 * Reduce provider text to the small, display-safe title contract.
 *
 * This pure boundary owns provider-noise removal, word/length limits, trailing
 * punctuation, and copy detection. Lifecycle code decides when generation runs
 * and persistence decides whether the title can still be written.
 */
export const normalizeConversationTitle = (
  rawTitle: string,
  userContent: string,
): string | undefined => {
  const cleaned = stripGeneratedTitleNoise(rawTitle);
  const wordLimited = limitTitleWords(cleaned);
  const lengthLimited = limitTitleLength(wordLimited);
  const title = stripTrailingPunctuation(lengthLimited).trim();
  if (titleWordCount(title) < TITLE_MIN_WORDS) return undefined;
  if (isCopiedUserMessage(title, userContent)) return undefined;
  return title;
};

const stripGeneratedTitleNoise = (rawTitle: string): string =>
  rawTitle
    .split(/\r?\n/u)[0]
    ?.replace(/^\s*(?:title\s*:\s*)/iu, "")
    .replace(/^\s*[-*]\s*/u, "")
    .replace(/^["'`]+|["'`]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim() ?? "";

const limitTitleWords = (title: string): string =>
  title.split(/\s+/u).filter(Boolean).slice(0, TITLE_MAX_WORDS).join(" ");

const limitTitleLength = (title: string): string => {
  if (title.length <= TITLE_MAX_LENGTH) return title;

  const truncated = title.slice(0, TITLE_MAX_LENGTH).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
};

const stripTrailingPunctuation = (title: string): string => title.replace(/[.!?,:;]+$/u, "");

const titleWordCount = (title: string): number => title.split(/\s+/u).filter(Boolean).length;

const isCopiedUserMessage = (title: string, userContent: string): boolean =>
  comparisonText(title) === comparisonText(userContent);

const comparisonText = (text: string): string =>
  stripTrailingPunctuation(text).replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
