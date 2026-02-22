import { distance } from "fastest-levenshtein";
import { MananaEntry, KaraokeMatch } from "./types";
import { MATCH_THRESHOLD } from "./constants";

// Matches CJK Unified Ideographs, Hiragana, Katakana, Hangul
const CJK_RE = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

export function normalizeTitle(raw: string): string {
  let s = raw;
  s = s.replace(
    /\s*\((?:Official\s*(?:Video|Audio|MV|Music\s*Video|Lyric\s*Video)|feat\..*?|Feat\..*?|ft\..*?|with\s+.*?|Remix|Live|Acoustic|Ver\.|Version|Remaster(?:ed)?|Deluxe|Bonus\s*Track|from\s+".*?")\)/gi,
    "",
  );
  s = s.replace(/\s*\[.*?\]/g, "");
  // YouTube Music often appends " - English Title" to CJK titles (e.g. "アイドル - Idol")
  // Strip the English suffix if the part before the dash contains CJK characters
  const dashIdx = s.indexOf(" - ");
  if (dashIdx > 0 && CJK_RE.test(s.slice(0, dashIdx))) {
    s = s.slice(0, dashIdx);
  }
  s = s.replace(/\s+/g, " ").trim();
  s = s.normalize("NFC");
  return s;
}

export function normalizeArtist(raw: string): string {
  let s = raw;
  s = s.split(/[,&\/]|\bfeat\.?\b|\bft\.?\b|\bx\b/i)[0].trim();
  s = s.replace(/\s*- Topic$/, "").replace(/\s*- 토픽$/, "");
  s = s.normalize("NFC");
  return s;
}

export function similarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  return 1 - distance(la, lb) / maxLen;
}

export function findBestMatch(
  title: string,
  artist: string,
  candidates: MananaEntry[],
): KaraokeMatch | null {
  const normTitle = normalizeTitle(title).toLowerCase();
  const normArtist = normalizeArtist(artist).toLowerCase();

  let bestMatch: KaraokeMatch | null = null;
  let bestScore = 0;

  for (const entry of candidates) {
    const entryTitle = entry.title.normalize("NFC").toLowerCase();
    const entrySinger = entry.singer.normalize("NFC").toLowerCase();

    const titleScore = similarity(normTitle, entryTitle);
    const artistScore = normArtist
      ? similarity(normArtist, entrySinger)
      : 0.5;
    const combined = normArtist
      ? 0.6 * titleScore + 0.4 * artistScore
      : titleScore;

    if (combined > bestScore) {
      bestScore = combined;
      bestMatch = {
        no: entry.no,
        matchedTitle: entry.title,
        matchedSinger: entry.singer,
        score: combined,
      };
    }
  }

  if (bestMatch && bestScore >= MATCH_THRESHOLD) {
    return bestMatch;
  }
  return null;
}
