import { saveTJResults } from "./tj-db";
import { parseTJResults } from "./direct-search";

// Characters to crawl: Korean initial syllables, Japanese hiragana, English, digits
const CRAWL_CHARS = [
  // Korean (14 initial consonant syllables)
  "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
  // Japanese hiragana (basic vowels + common consonant rows)
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ",
  // English
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  // Digits
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
];

const TJ_SEARCH_URL = "https://www.tjmedia.com/song/accompaniment_search";
const PAGES_PER_RUN = 50;
const DELAY_MS = 300;
const CURSOR_KEY = "tj-crawl:cursor";

interface CrawlCursor {
  charIndex: number;
  pageNo: number;
}

/** Crawl TJ website systematically, resuming from last position */
export async function crawlTJ(
  db: D1Database,
  kv: KVNamespace,
): Promise<void> {
  // Load cursor
  let cursor: CrawlCursor = { charIndex: 0, pageNo: 1 };
  try {
    const saved = await kv.get<CrawlCursor>(CURSOR_KEY, "json");
    if (saved) cursor = saved;
  } catch {}

  let pagesProcessed = 0;

  while (pagesProcessed < PAGES_PER_RUN && cursor.charIndex < CRAWL_CHARS.length) {
    const char = CRAWL_CHARS[cursor.charIndex];
    const url = `${TJ_SEARCH_URL}?strType=1&searchTxt=${encodeURIComponent(char)}&pageRowCnt=100&pageNo=${cursor.pageNo}`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NoraebangFinder/1.0)" },
      });

      if (!res.ok) {
        // Skip this character on error
        cursor.charIndex++;
        cursor.pageNo = 1;
        continue;
      }

      const html = await res.text();
      const results = parseTJResults(html);

      if (results.length > 0) {
        await saveTJResults(db, results);
      }

      pagesProcessed++;

      if (results.length < 100) {
        // Last page for this character — move to next
        cursor.charIndex++;
        cursor.pageNo = 1;
      } else {
        cursor.pageNo++;
      }

      await new Promise((r) => setTimeout(r, DELAY_MS));
    } catch {
      // Network error — move to next character
      cursor.charIndex++;
      cursor.pageNo = 1;
    }
  }

  // Save cursor for next run
  if (cursor.charIndex >= CRAWL_CHARS.length) {
    // Full crawl complete — reset to start
    cursor = { charIndex: 0, pageNo: 1 };
  }
  await kv.put(CURSOR_KEY, JSON.stringify(cursor));
}
