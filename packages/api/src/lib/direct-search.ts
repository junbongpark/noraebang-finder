import { KaraokeMatch } from "./types";
import { normalizeTitle, normalizeArtist, similarity } from "./matching";

interface DirectResult {
  no: string;
  title: string;
  singer: string;
}

/** Search TJ Media website directly */
export async function searchTJ(query: string): Promise<DirectResult[]> {
  const url = `https://www.tjmedia.com/song/accompaniment_search?strType=1&searchTxt=${encodeURIComponent(query)}&pageRowCnt=30`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NoraebangFinder/1.0)" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseTJResults(html);
  } catch {
    return [];
  }
}

export function parseTJResults(html: string): DirectResult[] {
  const results: DirectResult[] = [];
  // Each result block: <span class="num2">NUMBER</span> ... title3 ... title4
  const blockRe = /<li[^>]*class="grid-item num2"[^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>[\s\S]*?<li[^>]*class="grid-item title3"[^>]*>[\s\S]*?<p><span>([\s\S]*?)<\/span><\/p>[\s\S]*?<li[^>]*class="grid-item title4[^"]*"[^>]*>[\s\S]*?<p><span>([\s\S]*?)<\/span><\/p>/g;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    results.push({
      no: match[1],
      title: stripHtml(match[2]),
      singer: stripHtml(match[3]),
    });
  }
  if (results.length > 0) return results;

  // Fallback: simpler regex for num2 + next spans
  const numRe = /<span class="num2">(\d+)<\/span>/g;
  const nums: string[] = [];
  while ((match = numRe.exec(html)) !== null) nums.push(match[1]);

  const titleRe = /class="grid-item title3[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  const titles: string[] = [];
  while ((match = titleRe.exec(html)) !== null) titles.push(stripHtml(match[1]));

  const singerRe = /class="grid-item title4[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  const singers: string[] = [];
  while ((match = singerRe.exec(html)) !== null) singers.push(stripHtml(match[1]));

  for (let i = 0; i < nums.length && i < titles.length && i < singers.length; i++) {
    results.push({ no: nums[i], title: titles[i], singer: singers[i] });
  }
  return results;
}

const CJK_RE = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

function isLatin(s: string): boolean {
  const letters = s.replace(/[\s\d\W]/g, "");
  if (!letters) return false;
  return /^[a-zA-Z]+$/.test(letters);
}

function isCJK(s: string): boolean {
  return CJK_RE.test(s);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

/** Find best match from direct search results */
export function matchDirect(
  title: string,
  artist: string,
  results: DirectResult[],
  artistAliases?: string[],
): KaraokeMatch | null {
  if (results.length === 0) return null;
  const normTitle = normalizeTitle(title).toLowerCase();
  const normArtist = normalizeArtist(artist).toLowerCase();
  const allArtistNames = [normArtist, ...(artistAliases ?? []).map((a) => a.toLowerCase())];
  let best: KaraokeMatch | null = null;
  let bestScore = 0;

  for (const r of results) {
    // Strip parenthetical metadata from DB titles (e.g. "Lemon(ドラマ'...' OST)")
    const cleanTitle = r.title.replace(/\s*\(.*?\)\s*$/, "").trim();
    const entryTitle = normalizeTitle(cleanTitle).toLowerCase();
    const entrySinger = r.singer.normalize("NFC").toLowerCase();
    const titleScore = similarity(normTitle, entryTitle);

    let artistScore = 0;
    if (!normArtist) {
      artistScore = 0.5;
    } else {
      // Try all known names for this artist and pick best match
      for (const name of allArtistNames) {
        const nameIsLatin = isLatin(name);
        const nameIsCJK = isCJK(name);
        const singerIsLatin = isLatin(entrySinger);
        const singerIsCJK = isCJK(entrySinger);
        const crossScript =
          (nameIsLatin && singerIsCJK) || (nameIsCJK && singerIsLatin);
        const score = crossScript ? 0 : similarity(name, entrySinger);
        if (score > artistScore) artistScore = score;
      }
    }

    const combined = normArtist
      ? 0.6 * titleScore + 0.4 * artistScore
      : titleScore;

    if (combined > bestScore) {
      bestScore = combined;
      best = {
        no: r.no,
        matchedTitle: r.title,
        matchedSinger: r.singer,
        score: combined,
      };
    }
  }

  return best && bestScore >= 0.5 ? best : null;
}
