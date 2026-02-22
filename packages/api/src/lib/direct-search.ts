import { KaraokeMatch } from "./types";
import { normalizeTitle, similarity } from "./matching";

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

function parseTJResults(html: string): DirectResult[] {
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

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

/** Find best match from direct search results */
export function matchDirect(
  title: string,
  artist: string,
  results: DirectResult[],
): KaraokeMatch | null {
  if (results.length === 0) return null;
  const normTitle = normalizeTitle(title).toLowerCase();
  let best: KaraokeMatch | null = null;
  let bestScore = 0;

  for (const r of results) {
    const entryTitle = r.title.toLowerCase();
    const score = similarity(normTitle, entryTitle);
    if (score > bestScore) {
      bestScore = score;
      best = {
        no: r.no,
        matchedTitle: r.title,
        matchedSinger: r.singer,
        score,
      };
    }
  }

  return best && bestScore >= 0.5 ? best : null;
}
