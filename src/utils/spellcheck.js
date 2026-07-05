import nspell from "nspell";
import englishAff from "../assets/dictionaries/en_US.aff?raw";
import englishDic from "../assets/dictionaries/en_US.dic?raw";

const WORD_PATTERN = /[A-Za-z][A-Za-z'\u2019-]*/g;

const EXTRA_WORDS = [
  "Flow",
  "Instagram",
  "YouTube",
  "TikTok",
  "webp",
  "jpeg",
  "jpg",
  "png",
  "ocr",
  "exe",
  "desktop",
  "screenshot",
  "carousel",
  "metadata",
  "markdown",
];

const COMMON_ABBREVIATIONS = new Set([
  "app",
  "api",
  "cpu",
  "dpi",
  "gpu",
  "id",
  "ipc",
  "jpg",
  "jpeg",
  "ocr",
  "png",
  "ui",
  "url",
  "webp",
]);

const OCR_NOISE_WORDS = new Set([
  "lll",
  "ili",
  "illl",
  "rn",
  "vv",
  "ww",
]);

let englishSpellChecker;

function getEnglishSpellChecker() {
  if (!englishSpellChecker) {
    englishSpellChecker = nspell(englishAff, englishDic);
    EXTRA_WORDS.forEach((word) => englishSpellChecker.add(word));
  }
  return englishSpellChecker;
}

function normalizeWord(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^-+|-+$/g, "")
    .replace(/^'+|'+$/g, "")
    .trim();
}

function hasVowelLikeSound(word) {
  return /[aeiouy]/i.test(word);
}

function isProbablyOcrArtifact(word) {
  const compact = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!compact) return true;
  if (OCR_NOISE_WORDS.has(compact)) return true;
  if (compact.length <= 2) return true;
  if (compact.length >= 5 && !hasVowelLikeSound(compact)) return true;
  if (/([a-z])\1{3,}/i.test(compact)) return true;
  const narrowGlyphs = (compact.match(/[il1|]/g) || []).length;
  return compact.length >= 4 && narrowGlyphs / compact.length > 0.78;
}

function shouldSkipWord(word) {
  if (!word) return true;
  const lower = word.toLowerCase();
  if (word.length <= 2) return true;
  if (COMMON_ABBREVIATIONS.has(lower)) return true;
  if (/^\d+$/.test(word)) return true;
  if (/\d/.test(word)) return true;
  if (/^[A-Z]{2,}$/.test(word)) return true;
  if (/https?|www|\.com|\.org|\.net|\.io|\.app/i.test(word)) return true;
  if (isProbablyOcrArtifact(word)) return true;
  if (/^[a-z]+'[a-z]+$/i.test(word)) return false;
  return false;
}

export async function checkEnglishSpelling(
  text,
  { maxIssues = 24, maxSuggestions = 4 } = {},
) {
  const checker = getEnglishSpellChecker();
  const issues = [];
  const seenWords = new Set();
  const source = String(text || "");

  for (const match of source.matchAll(WORD_PATTERN)) {
    const original = match[0];
    const word = normalizeWord(original);
    const lower = word.toLowerCase();
    if (shouldSkipWord(word)) continue;
    if (seenWords.has(lower)) continue;
    if (checker.correct(word)) continue;

    const suggestions = checker
      .suggest(word)
      .filter((value) => value && value.toLowerCase() !== lower)
      .slice(0, maxSuggestions);

    issues.push({
      offset: match.index,
      length: original.length,
      word: original,
      normalizedWord: word,
      message: `"${original}" may be misspelled.`,
      replacements: suggestions.map((value) => ({ value })),
    });
    seenWords.add(lower);

    if (issues.length >= maxIssues) break;
  }

  return issues;
}
