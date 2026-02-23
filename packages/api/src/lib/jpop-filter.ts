/**
 * J-pop song detection for filtering releases.
 *
 * Strategy:
 * 1. Known J-pop artist list (romaji-only names) -> J-pop
 * 2. Hiragana or Katakana in singer OR title -> J-pop (exclusively Japanese scripts)
 *
 * Note: CJK Kanji alone is NOT used as an indicator because it overlaps with Chinese.
 */

const HIRAGANA_RE = /[\u3040-\u309f]/;
const KATAKANA_RE = /[\u30a0-\u30ff]/;

const KNOWN_JPOP_ARTISTS: Set<string> = new Set([
  "yoasobi",
  "ado",
  "king gnu",
  "back number",
  "mrs. green apple",
  "one ok rock",
  "radwimps",
  "lisa",
  "aimer",
  "eve",
  "vaundy",
  "milet",
  "imase",
  "creepy nuts",
  "man with a mission",
  "bump of chicken",
  "sekai no owari",
  "amazarashi",
  "yorushika",
  "zutomayo",
  "yama",
  "tani yuuki",
  "sumika",
  "nulbarich",
  "reol",
  "dustcell",
  "tuyu",
  "myuk",
  "tuki.",
]);

function hasJapaneseScript(s: string): boolean {
  return HIRAGANA_RE.test(s) || KATAKANA_RE.test(s);
}

export function isJpopSong(singer: string, title: string): boolean {
  // Rule 1: Known romaji-only J-pop artists
  if (KNOWN_JPOP_ARTISTS.has(singer.trim().toLowerCase())) {
    return true;
  }

  // Rule 2: Hiragana or Katakana in singer or title → exclusively Japanese
  return hasJapaneseScript(singer) || hasJapaneseScript(title);
}
