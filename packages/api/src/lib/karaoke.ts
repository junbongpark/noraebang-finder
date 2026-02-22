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

/** In-memory dedup cache for a single batch run */
class FetchCache {
  private inflight = new Map<string, Promise<MananaEntry[]>>();

  fetch(path: string, kv?: KVNamespace): Promise<MananaEntry[]> {
    const existing = this.inflight.get(path);
    if (existing) return existing;
    const promise = fetchMananaRaw(path, kv);
    this.inflight.set(path, promise);
    return promise;
  }
}

export async function fetchMananaRaw(
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
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
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
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return [];
    }
  }
  return [];
}

function matchFromEntries(
  track: PlaylistTrack,
  entries: MananaEntry[],
): KaraokeResult {
  const result: KaraokeResult = {
    title: track.title,
    artist: track.artist,
    tj: null,
    ky: null,
    joysound: null,
  };
  if (entries.length === 0) return result;

  const tjEntries = entries.filter((e) => e.brand === "tj");
  const kyEntries = entries.filter((e) => e.brand === "kumyoung");
  const jsEntries = entries.filter((e) => e.brand === "joysound");

  result.tj = findBestMatch(track.title, track.artist, tjEntries);
  result.ky = findBestMatch(track.title, track.artist, kyEntries);
  result.joysound = findBestMatch(track.title, track.artist, jsEntries);
  return result;
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
  cache: FetchCache,
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
  const entries = await cache.fetch(
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

  // Only try artist-based search if title search found SOME results
  // (meaning the song exists in the DB but under a different artist)
  // or if the artist has a known alias (e.g. BTS → 방탄소년단)
  const hasAny = result.tj || result.ky || result.joysound;
  const hasMissing = () => !result.tj || !result.ky || !result.joysound;
  const aliases = ARTIST_ALIASES[normArtist.toLowerCase()] ?? [];

  if (hasMissing() && normArtist && (hasAny || aliases.length > 0)) {
    // Try alias first (more targeted)
    for (const alias of aliases) {
      if (!hasMissing()) break;
      const aliasEntries = await cache.fetch(
        `singer/${encodeURIComponent(alias)}.json`,
        kv,
      );
      fillMissing(result, track, aliasEntries);
    }

    // Then try original artist name if still missing
    if (hasMissing()) {
      const artistEntries = await cache.fetch(
        `singer/${encodeURIComponent(normArtist)}.json`,
        kv,
      );
      fillMissing(result, track, artistEntries);
    }
  }

  return result;
}

export async function lookupKaraokeBatch(
  tracks: PlaylistTrack[],
  kv?: KVNamespace,
): Promise<KaraokeResult[]> {
  const cache = new FetchCache();
  const results: KaraokeResult[] = new Array(tracks.length);

  // Phase 1: Pre-fetch artist catalogs for artists with 2+ tracks
  // This avoids redundant per-title lookups when we already have the full catalog
  const artistGroups = new Map<string, number[]>();
  for (let i = 0; i < tracks.length; i++) {
    const normArtist = normalizeArtist(tracks[i].artist);
    if (!normArtist) continue;
    const group = artistGroups.get(normArtist) ?? [];
    group.push(i);
    artistGroups.set(normArtist, group);
  }

  // Pre-fetch artist catalogs concurrently for multi-track artists
  const bulkArtists = [...artistGroups.entries()].filter(
    ([, indices]) => indices.length >= 2,
  );

  if (bulkArtists.length > 0) {
    const prefetchTasks: Promise<void>[] = [];
    let prefetchIdx = 0;

    const prefetchWorkers = Array.from(
      { length: KARAOKE_CONCURRENCY },
      async () => {
        while (prefetchIdx < bulkArtists.length) {
          const i = prefetchIdx++;
          const [artist, indices] = bulkArtists[i];

          // Fetch artist catalog (deduped via cache)
          const artistEntries = await cache.fetch(
            `singer/${encodeURIComponent(artist)}.json`,
            kv,
          );

          // Also try aliases
          const aliases =
            ARTIST_ALIASES[artist.toLowerCase()] ?? [];
          let allEntries = artistEntries;
          for (const alias of aliases) {
            const aliasEntries = await cache.fetch(
              `singer/${encodeURIComponent(alias)}.json`,
              kv,
            );
            if (aliasEntries.length > 0) {
              allEntries = [...allEntries, ...aliasEntries];
            }
          }

          // Match all tracks from this artist against the catalog
          for (const idx of indices) {
            results[idx] = matchFromEntries(tracks[idx], allEntries);
          }
        }
      },
    );

    await Promise.all(prefetchWorkers);
  }

  // Phase 2: Look up remaining tracks (single-artist or unmatched) by title
  let index = 0;
  const workers = Array.from({ length: KARAOKE_CONCURRENCY }, async () => {
    while (index < tracks.length) {
      const i = index++;
      // Skip if already resolved by artist catalog in phase 1
      if (results[i]) {
        // If phase 1 found some but not all brands, try title search to fill gaps
        const r = results[i];
        if (!r.tj || !r.ky || !r.joysound) {
          const normTitle = normalizeTitle(tracks[i].title);
          const entries = await cache.fetch(
            `song/${encodeURIComponent(normTitle)}.json`,
            kv,
          );
          fillMissing(r, tracks[i], entries);
        }
        continue;
      }
      results[i] = await lookupTrack(tracks[i], cache, kv);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function lookupKaraokeStream(
  tracks: PlaylistTrack[],
  kv: KVNamespace | undefined,
  onResult: (index: number, result: KaraokeResult) => Promise<void>,
): Promise<void> {
  const cache = new FetchCache();
  const resolved = new Set<number>();

  // Phase A: Cache-only lookup (no network) — parallel KV lookups
  if (kv) {
    await Promise.all(
      tracks.map(async (track, i) => {
        const normTitle = normalizeTitle(track.title);
        const normArtist = normalizeArtist(track.artist);

        const songKey = `manana:song/${encodeURIComponent(normTitle)}.json`;
        const singerKey = `manana:singer/${encodeURIComponent(normArtist)}.json`;

        const aliases = ARTIST_ALIASES[normArtist.toLowerCase()] ?? [];
        const aliasKeys = aliases.map(
          (a) => `manana:singer/${encodeURIComponent(a)}.json`,
        );

        const kvKeys = [songKey, singerKey, ...aliasKeys];
        const kvResults = await Promise.all(
          kvKeys.map(async (key) => {
            try {
              return await kv.get<MananaEntry[]>(key, "json");
            } catch {
              return null;
            }
          }),
        );

        const allEntries: MananaEntry[] = [];
        for (const cached of kvResults) {
          if (cached) allEntries.push(...cached);
        }

        if (allEntries.length > 0) {
          const result = matchFromEntries(track, allEntries);
          if (result.tj || result.ky || result.joysound) {
            resolved.add(i);
            await onResult(i, result);
          }
        }
      }),
    );
  }

  // Phase B: Artist catalog fetch for artists with 2+ unresolved tracks
  const artistGroups = new Map<string, number[]>();
  for (let i = 0; i < tracks.length; i++) {
    if (resolved.has(i)) continue;
    const normArtist = normalizeArtist(tracks[i].artist);
    if (!normArtist) continue;
    const group = artistGroups.get(normArtist) ?? [];
    group.push(i);
    artistGroups.set(normArtist, group);
  }

  const bulkArtists = [...artistGroups.entries()].filter(
    ([, indices]) => indices.length >= 2,
  );

  if (bulkArtists.length > 0) {
    let prefetchIdx = 0;
    const prefetchWorkers = Array.from(
      { length: KARAOKE_CONCURRENCY },
      async () => {
        while (prefetchIdx < bulkArtists.length) {
          const i = prefetchIdx++;
          const [artist, indices] = bulkArtists[i];

          const artistEntries = await cache.fetch(
            `singer/${encodeURIComponent(artist)}.json`,
            kv,
          );

          const aliases = ARTIST_ALIASES[artist.toLowerCase()] ?? [];
          let allEntries = artistEntries;
          for (const alias of aliases) {
            const aliasEntries = await cache.fetch(
              `singer/${encodeURIComponent(alias)}.json`,
              kv,
            );
            if (aliasEntries.length > 0) {
              allEntries = [...allEntries, ...aliasEntries];
            }
          }

          for (const idx of indices) {
            const result = matchFromEntries(tracks[idx], allEntries);
            resolved.add(idx);
            await onResult(idx, result);
          }
        }
      },
    );
    await Promise.all(prefetchWorkers);
  }

  // Phase C: Individual title search for remaining unresolved tracks
  let index = 0;
  const unresolvedIndices = tracks
    .map((_, i) => i)
    .filter((i) => !resolved.has(i));

  const workers = Array.from({ length: KARAOKE_CONCURRENCY }, async () => {
    while (index < unresolvedIndices.length) {
      const pos = index++;
      if (pos >= unresolvedIndices.length) break;
      const i = unresolvedIndices[pos];
      const result = await lookupTrack(tracks[i], cache, kv);
      await onResult(i, result);
    }
  });

  await Promise.all(workers);
}
