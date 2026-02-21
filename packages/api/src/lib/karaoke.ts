import {
  MANANA_BASE_URL,
  KARAOKE_CONCURRENCY,
  CACHE_TTL_SECONDS,
} from "./constants";
import { MananaEntry, KaraokeResult, PlaylistTrack } from "./types";
import { normalizeTitle, normalizeArtist, findBestMatch } from "./matching";

const ARTIST_ALIASES: Record<string, string[]> = {
  bts: ["방탄소년단"],
  "bangtan boys": ["방탄소년단"],
  blackpink: ["블랙핑크"],
  "stray kids": ["스트레이키즈"],
  twice: ["트와이스"],
  iu: ["아이유"],
  "g-dragon": ["지드래곤"],
  bigbang: ["빅뱅"],
  exo: ["엑소"],
  "red velvet": ["레드벨벳"],
  aespa: ["에스파"],
  "nct dream": ["NCT DREAM"],
  seventeen: ["세븐틴"],
  txt: ["투모로우바이투게더"],
  enhypen: ["엔하이픈"],
  itzy: ["있지"],
  "le sserafim": ["르세라핌"],
  newjeans: ["뉴진스"],
  ateez: ["에이티즈"],
  "girls generation": ["소녀시대"],
  snsd: ["소녀시대"],
  shinee: ["샤이니"],
  "super junior": ["슈퍼주니어"],
  psy: ["싸이"],
  zico: ["지코"],
  "jay park": ["박재범"],
  crush: ["크러쉬"],
  dean: ["딘"],
  heize: ["헤이즈"],
  taeyeon: ["태연"],
  rosé: ["로제"],
  rose: ["로제"],
  jimin: ["지민"],
  jungkook: ["정국"],
  suga: ["슈가"],
  v: ["뷔"],
  rm: ["RM"],
  jhope: ["제이홉"],
  "j-hope": ["제이홉"],
  lisa: ["리사"],
  jennie: ["제니"],
  hwasa: ["화사"],
};

async function fetchManana(
  path: string,
  kv?: KVNamespace,
): Promise<MananaEntry[]> {
  const cacheKey = `manana:${path}`;

  // Check KV cache
  if (kv) {
    try {
      const cached = await kv.get<MananaEntry[]>(cacheKey, "json");
      if (cached) return cached;
    } catch {
      // KV error, continue to fetch
    }
  }

  const url = `${MANANA_BASE_URL}/${path}`;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return [];
      }
      const data: unknown = await res.json();
      const entries = Array.isArray(data) ? (data as MananaEntry[]) : [];

      // Cache in KV
      if (entries.length > 0 && kv) {
        kv.put(cacheKey, JSON.stringify(entries), {
          expirationTtl: CACHE_TTL_SECONDS,
        }).catch(() => {});
      }

      return entries;
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return [];
    }
  }
  return [];
}

function fillMissing(
  result: KaraokeResult,
  track: PlaylistTrack,
  entries: MananaEntry[],
) {
  if (entries.length === 0) return;
  const tjEntries = entries.filter((e) => e.brand === "tj");
  const kyEntries = entries.filter((e) => e.brand === "kumyoung");
  const jsEntries = entries.filter((e) => e.brand === "joysound");

  if (!result.tj) result.tj = findBestMatch(track.title, track.artist, tjEntries);
  if (!result.ky) result.ky = findBestMatch(track.title, track.artist, kyEntries);
  if (!result.joysound)
    result.joysound = findBestMatch(track.title, track.artist, jsEntries);
}

async function lookupTrack(
  track: PlaylistTrack,
  kv?: KVNamespace,
): Promise<KaraokeResult> {
  const result: KaraokeResult = {
    title: track.title,
    artist: track.artist,
    tj: null,
    ky: null,
    joysound: null,
  };

  const normTitle = normalizeTitle(track.title);
  const normArtist = normalizeArtist(track.artist);

  // Search by song title
  const entries = await fetchManana(
    `song/${encodeURIComponent(normTitle)}.json`,
    kv,
  );

  if (entries.length > 0) {
    const tjEntries = entries.filter((e) => e.brand === "tj");
    const kyEntries = entries.filter((e) => e.brand === "kumyoung");
    const jsEntries = entries.filter((e) => e.brand === "joysound");

    result.tj = findBestMatch(track.title, track.artist, tjEntries);
    result.ky = findBestMatch(track.title, track.artist, kyEntries);
    result.joysound = findBestMatch(track.title, track.artist, jsEntries);
  }

  const hasMissing = () => !result.tj || !result.ky || !result.joysound;

  // Retry with artist name
  if (hasMissing() && normArtist) {
    const artistEntries = await fetchManana(
      `singer/${encodeURIComponent(normArtist)}.json`,
      kv,
    );
    fillMissing(result, track, artistEntries);
  }

  // Try artist aliases
  if (hasMissing() && normArtist) {
    const aliases = ARTIST_ALIASES[normArtist.toLowerCase()] ?? [];
    for (const alias of aliases) {
      if (!hasMissing()) break;
      const aliasEntries = await fetchManana(
        `singer/${encodeURIComponent(alias)}.json`,
        kv,
      );
      fillMissing(result, track, aliasEntries);
    }
  }

  return result;
}

export async function lookupKaraokeBatch(
  tracks: PlaylistTrack[],
  kv?: KVNamespace,
): Promise<KaraokeResult[]> {
  const results: KaraokeResult[] = new Array(tracks.length);
  let index = 0;

  const workers = Array.from({ length: KARAOKE_CONCURRENCY }, async () => {
    while (index < tracks.length) {
      const i = index++;
      results[i] = await lookupTrack(tracks[i], kv);
    }
  });

  await Promise.all(workers);
  return results;
}
