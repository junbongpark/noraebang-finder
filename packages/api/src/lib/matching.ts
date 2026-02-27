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

/** Check if a string is primarily Latin (ASCII letters) */
function isLatin(s: string): boolean {
  const letters = s.replace(/[\s\d\W]/g, "");
  if (!letters) return false;
  return /^[a-zA-Z]+$/.test(letters);
}

/** Check if a string contains CJK characters */
function isCJK(s: string): boolean {
  return CJK_RE.test(s);
}

export function findBestMatch(
  title: string,
  artist: string,
  candidates: MananaEntry[],
  artistAliases?: string[],
): KaraokeMatch | null {
  const normTitle = normalizeTitle(title).toLowerCase();
  const normArtist = normalizeArtist(artist).toLowerCase();
  const allArtistNames = [normArtist, ...(artistAliases ?? []).map((a) => a.toLowerCase())];

  let bestMatch: KaraokeMatch | null = null;
  let bestScore = 0;
  let secondBestScore = 0;
  let bestArtistScore = 0;

  for (const entry of candidates) {
    const entryTitle = entry.title.normalize("NFC").toLowerCase();
    const entrySinger = entry.singer.normalize("NFC").toLowerCase();

    const titleScore = similarity(normTitle, entryTitle);
    let artistScore: number;
    let bestArtistRaw = 0;

    if (!normArtist) {
      artistScore = 0.5;
      bestArtistRaw = 0.5;
    } else {
      // Try all known names for this artist and pick best match
      artistScore = 0;
      for (const name of allArtistNames) {
        const nameIsLatin = isLatin(name);
        const nameIsCJK = isCJK(name);
        const singerIsLatin = isLatin(entrySinger);
        const singerIsCJK = isCJK(entrySinger);
        const crossScript =
          (nameIsLatin && singerIsCJK) || (nameIsCJK && singerIsLatin);
        const raw = similarity(name, entrySinger);
        const score = crossScript ? raw * 0.1 : raw;
        if (score > artistScore) artistScore = score;
        if (raw > bestArtistRaw) bestArtistRaw = raw;
      }
    }

    const combined = normArtist
      ? 0.6 * titleScore + 0.4 * artistScore
      : titleScore;

    if (combined > bestScore) {
      secondBestScore = bestScore;
      bestScore = combined;
      bestArtistScore = bestArtistRaw;
      bestMatch = {
        no: entry.no,
        matchedTitle: entry.title,
        matchedSinger: entry.singer,
        score: combined,
      };
    } else if (combined > secondBestScore) {
      secondBestScore = combined;
    }
  }

  if (!bestMatch || bestScore < MATCH_THRESHOLD) return null;

  // Ambiguity rejection: if top 2 scores are within 0.05, we can't differentiate
  if (normArtist && secondBestScore > 0 && bestScore - secondBestScore < 0.05) {
    return null;
  }

  // Reject if artist was provided but best artist similarity is very low
  if (normArtist && bestArtistScore < 0.35) {
    return null;
  }

  return bestMatch;
}
