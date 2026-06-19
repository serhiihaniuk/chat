export const createDeterministicTitle = (userText: string): string | undefined => {
  if (!userText.startsWith("Prepare a short conversation title")) return undefined;

  const firstUserMessage = sectionText(userText, "User message:", "Assistant response:");
  const titleWords = titleKeywords(userText);
  if (/\b(hello|hi)\b/iu.test(firstUserMessage)) {
    return sentenceCaseTitle([...titleWords, "greeting"]);
  }
  return sentenceCaseTitle(titleWords);
};

const sectionText = (text: string, startLabel: string, endLabel: string): string => {
  const start = text.indexOf(startLabel);
  const end = text.indexOf(endLabel);
  if (start < 0 || end < start) return "";
  return text.slice(start + startLabel.length, end).trim();
};

const titleKeywords = (text: string): readonly string[] => {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of text.toLocaleLowerCase("en-US").match(/[a-z0-9]+/gu) ?? []) {
    if (titleStopWords.has(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length === 6) break;
  }
  return words;
};

const sentenceCaseTitle = (words: readonly string[]): string =>
  words.length === 0
    ? "New conversation"
    : `${words.join(" ").charAt(0).toLocaleUpperCase("en-US")}${words.join(" ").slice(1)}`;

const titleStopWordsText =
  "a about an and are as assistant be chat completed conversation did do does exchange exactly explain fake for from hello hi i in is it message of on prepare reply response short the this title to user was what who with you";

const titleStopWords = new Set(titleStopWordsText.split(" "));
