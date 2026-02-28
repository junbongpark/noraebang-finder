import {
  MANANA_BASE_URL,
  KARAOKE_CONCURRENCY,
  CACHE_TTL_SECONDS,
} from "./constants";
import { MananaEntry, KaraokeResult, PlaylistTrack } from "./types";
import { normalizeTitle, normalizeArtist, findBestMatch } from "./matching";
import { searchTJ, matchDirect } from "./direct-search";
import { searchTJFromDB, saveTJResults } from "./tj-db";
import { lookupArtistAliases } from "./musicbrainz";

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
  jimin: ["지민", "박지민"],
  jungkook: ["정국", "전정국"],
  suga: ["슈가", "민윤기", "Agust D"],
  v: ["뷔", "김태형"],
  rm: ["김남준"],
  jhope: ["제이홉", "정호석"],
  "j-hope": ["제이홉"],
  lisa: ["리사", "リサ", "LiSA"],
  jennie: ["제니"],
  hwasa: ["화사"],
  // Jpop artist aliases (romaji → Japanese)
  "kenshi yonezu": ["米津玄師"],
  yorushika: ["ヨルシカ"],
  yoasobi: ["YOASOBI"],
  "king gnu": ["King Gnu"],
  ado: ["Ado"],
  aimer: ["Aimer"],
  aimyon: ["あいみょん"],
  "tuki.": ["tuki."],
  eill: ["eill"],
  yuuri: ["優里"],
  zutomayo: ["ずっと真夜中でいいのに。", "ZUTOMAYO"],
  "back number": ["back number"],
  "mrs. green apple": ["Mrs. GREEN APPLE"],
  "sheena ringo": ["椎名林檎"],
  "fujii kaze": ["藤井風"],
  "hikaru utada": ["宇多田ヒカル"],
  "eve": ["Eve"],
  reol: ["Reol"],
  "official hige dandism": ["Official髭男dism"],
  "radwimps": ["RADWIMPS"],
  "bump of chicken": ["BUMP OF CHICKEN"],
  "one ok rock": ["ONE OK ROCK"],
  "creepy nuts": ["Creepy Nuts"],
  "hoshino gen": ["星野源"],
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

function getAliases(artist: string): string[] {
  const normArtist = normalizeArtist(artist).toLowerCase();
  const hardAliases = ARTIST_ALIASES[normArtist] ?? [];
  // Extract parenthetical content as additional alias (e.g. "V (BTS)" → "BTS")
  const parenMatch = artist.match(/\(([^)]+)\)/);
  const parenAlias = parenMatch ? [parenMatch[1]] : [];
  return [...hardAliases, ...parenAlias];
}

function matchFromEntries(
  track: PlaylistTrack,
  entries: MananaEntry[],
  extraAliases?: string[],
): KaraokeResult {
  const result: KaraokeResult = {
    title: track.title,
    artist: track.artist,
    tj: null,
    ky: null,
    joysound: null,
  };
  if (entries.length === 0) return result;

  const aliases = [...getAliases(track.artist), ...(extraAliases ?? [])];
  const tjEntries = entries.filter((e) => e.brand === "tj");
  const kyEntries = entries.filter((e) => e.brand === "kumyoung");
  const jsEntries = entries.filter((e) => e.brand === "joysound");

  result.tj = findBestMatch(track.title, track.artist, tjEntries, aliases);
  result.ky = findBestMatch(track.title, track.artist, kyEntries, aliases);
  result.joysound = findBestMatch(track.title, track.artist, jsEntries, aliases);
  return result;
}

function fillMissing(
  result: KaraokeResult,
  track: PlaylistTrack,
  entries: MananaEntry[],
  extraAliases?: string[],
) {
  if (entries.length === 0) return;
  const aliases = [...getAliases(track.artist), ...(extraAliases ?? [])];
  const tjEntries = entries.filter((e) => e.brand === "tj");
  const kyEntries = entries.filter((e) => e.brand === "kumyoung");
  const jsEntries = entries.filter((e) => e.brand === "joysound");

  if (!result.tj) result.tj = findBestMatch(track.title, track.artist, tjEntries, aliases);
  if (!result.ky) result.ky = findBestMatch(track.title, track.artist, kyEntries, aliases);
  if (!result.joysound)
    result.joysound = findBestMatch(track.title, track.artist, jsEntries, aliases);
}

const TJ_FALLBACK_MAX = 10;

async function lookupTrack(
  track: PlaylistTrack,
  cache: FetchCache,
  tjFallbackBudget: { remaining: number },
  kv?: KVNamespace,
  db?: D1Database,
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
  let aliases = ARTIST_ALIASES[normArtist.toLowerCase()] ?? [];
  if (aliases.length === 0) {
    aliases = await lookupArtistAliases(normArtist, kv);
  }

  // Search by song title
  const entries = await cache.fetch(
    `song/${encodeURIComponent(normTitle)}.json`,
    kv,
  );
  if (entries.length > 0) {
    const tjEntries = entries.filter((e) => e.brand === "tj");
    const kyEntries = entries.filter((e) => e.brand === "kumyoung");
    const jsEntries = entries.filter((e) => e.brand === "joysound");

    result.tj = findBestMatch(track.title, track.artist, tjEntries, aliases);
    result.ky = findBestMatch(track.title, track.artist, kyEntries, aliases);
    result.joysound = findBestMatch(track.title, track.artist, jsEntries, aliases);
  }

  // Only try artist-based search if title search found SOME results
  // (meaning the song exists in the DB but under a different artist)
  // or if the artist has a known alias (e.g. BTS → 방탄소년단)
  const hasAny = result.tj || result.ky || result.joysound;
  const hasMissing = () => !result.tj || !result.ky || !result.joysound;

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

  // Fallback 1: D1 database lookup (also try if Manana match is low confidence)
  if (db && (!result.tj || result.tj.score < 0.8)) {
    const d1Match = await searchTJFromDB(db, normTitle, track.artist, aliases);
    if (d1Match && (!result.tj || d1Match.score > result.tj.score)) {
      result.tj = d1Match;
    }
  }

  // Fallback 2: direct search on TJ website if D1 also has no results
  if (!result.tj && tjFallbackBudget.remaining > 0) {
    tjFallbackBudget.remaining--;
    const tjResults = await searchTJ(normTitle);
    result.tj = matchDirect(track.title, track.artist, tjResults, aliases);
    // Save scraped results to D1 for future lookups
    if (tjResults.length > 0 && db) {
      saveTJResults(db, tjResults).catch(() => {});
    }
  }

  return result;
}

export async function lookupKaraokeBatch(
  tracks: PlaylistTrack[],
  kv?: KVNamespace,
  db?: D1Database,
): Promise<KaraokeResult[]> {
  const cache = new FetchCache();
  const tjFallbackBudget = { remaining: TJ_FALLBACK_MAX };
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

          // Also try aliases (hardcoded + MusicBrainz)
          let aliases = ARTIST_ALIASES[artist.toLowerCase()] ?? [];
          if (aliases.length === 0) {
            aliases = await lookupArtistAliases(artist, kv);
          }
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
            const result = matchFromEntries(tracks[idx], allEntries, aliases);
            // Only mark as resolved if at least one brand matched
            if (result.tj || result.ky || result.joysound) {
              results[idx] = result;
            }
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
      if (results[i]) {
        // Phase 1 found some brands; try title search to fill gaps
        const r = results[i];
        if (!r.tj || !r.ky || !r.joysound) {
          const normTitle = normalizeTitle(tracks[i].title);
          const entries = await cache.fetch(
            `song/${encodeURIComponent(normTitle)}.json`,
            kv,
          );
          fillMissing(r, tracks[i], entries);
          // D1 fallback for missing TJ
          if (!r.tj && db) {
            const aliases = getAliases(tracks[i].artist);
            r.tj = await searchTJFromDB(db, normTitle, tracks[i].artist, aliases);
          }
        }
        continue;
      }
      // Not resolved by artist catalog — full lookup by title + artist
      results[i] = await lookupTrack(tracks[i], cache, tjFallbackBudget, kv, db);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function lookupKaraokeStream(
  tracks: PlaylistTrack[],
  kv: KVNamespace | undefined,
  onResult: (index: number, result: KaraokeResult) => Promise<void>,
  db?: D1Database,
): Promise<void> {
  const cache = new FetchCache();
  const tjFallbackBudget = { remaining: TJ_FALLBACK_MAX };
  const resolved = new Set<number>();

  // Phase A: Cache-only lookup (no network) — parallel KV lookups
  // Also resolve MusicBrainz aliases per unique artist (cached in KV)
  const mbAliasCache = new Map<string, string[]>();
  if (kv) {
    // Pre-resolve MusicBrainz aliases for unique artists
    const uniqueArtists = new Set<string>();
    for (const track of tracks) {
      const normArtist = normalizeArtist(track.artist).toLowerCase();
      if (normArtist && !(ARTIST_ALIASES[normArtist]?.length)) {
        uniqueArtists.add(normArtist);
      }
    }
    await Promise.all(
      [...uniqueArtists].map(async (artist) => {
        const mbAliases = await lookupArtistAliases(artist, kv);
        if (mbAliases.length > 0) mbAliasCache.set(artist, mbAliases);
      }),
    );

    await Promise.all(
      tracks.map(async (track, i) => {
        const normTitle = normalizeTitle(track.title);
        const normArtist = normalizeArtist(track.artist);

        const songKey = `manana:song/${encodeURIComponent(normTitle)}.json`;
        const singerKey = `manana:singer/${encodeURIComponent(normArtist)}.json`;

        const hardAliases = ARTIST_ALIASES[normArtist.toLowerCase()] ?? [];
        const mbAliases = mbAliasCache.get(normArtist.toLowerCase()) ?? [];
        const aliases = [...hardAliases, ...mbAliases];
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
          const result = matchFromEntries(track, allEntries, aliases);
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

          let aliases = ARTIST_ALIASES[artist.toLowerCase()] ?? [];
          if (aliases.length === 0) {
            aliases = await lookupArtistAliases(artist, kv);
          }
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
            const result = matchFromEntries(tracks[idx], allEntries, aliases);
            if (result.tj || result.ky || result.joysound) {
              resolved.add(idx);
              // D1 fallback for missing TJ
              if (!result.tj && db) {
                const normTitle = normalizeTitle(tracks[idx].title);
                result.tj = await searchTJFromDB(db, normTitle, tracks[idx].artist, aliases);
              }
              await onResult(idx, result);
            }
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
      const result = await lookupTrack(tracks[i], cache, tjFallbackBudget, kv, db);
      await onResult(i, result);
    }
  });

  await Promise.all(workers);
}
