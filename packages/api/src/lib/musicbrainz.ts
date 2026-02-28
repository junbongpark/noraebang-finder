/** MusicBrainz artist alias lookup with KV caching */

const MB_API = "https://musicbrainz.org/ws/2";
const MB_CACHE_PREFIX = "mb-alias:";
const MB_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days
const MB_EMPTY_TTL = 7 * 24 * 60 * 60; // 7 days for "no result" cache

// Matches CJK Unified Ideographs, Hiragana, Katakana, Hangul
const CJK_RE = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

interface MBArtist {
  score: number;
  name: string;
  aliases?: { name: string; locale?: string | null; type?: string | null }[];
}

interface MBSearchResult {
  artists?: MBArtist[];
}

/**
 * Look up artist aliases via MusicBrainz API.
 * Returns CJK-script names useful for matching against TJ/Manana.
 * Results are cached in KV to avoid repeated API calls.
 */
export async function lookupArtistAliases(
  artistName: string,
  kv?: KVNamespace,
): Promise<string[]> {
  const normalized = artistName.toLowerCase().trim();
  if (!normalized) return [];

  // Already CJK? No need to look up aliases.
  if (CJK_RE.test(normalized)) return [];

  const cacheKey = `${MB_CACHE_PREFIX}${normalized}`;

  // Check KV cache
  if (kv) {
    try {
      const cached = await kv.get<string[]>(cacheKey, "json");
      if (cached !== null) return cached;
    } catch {
      // KV read failure — proceed to API
    }
  }

  try {
    const url = `${MB_API}/artist/?query=${encodeURIComponent(artistName)}&fmt=json&limit=3`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "NoraebangFinder/1.0 (https://github.com/junbongpark/noraebang-finder)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      cacheEmpty(kv, cacheKey);
      return [];
    }

    const data: MBSearchResult = await res.json();
    const artists = data.artists ?? [];

    // Find the best match with score >= 90
    const best = artists.find((a) => a.score >= 90);
    if (!best) {
      cacheEmpty(kv, cacheKey);
      return [];
    }

    // Collect useful aliases: the primary name + CJK aliases
    const aliases = new Set<string>();

    // Primary name (often the native-script name, or exact capitalization)
    if (CJK_RE.test(best.name)) {
      aliases.add(best.name);
    } else if (best.name.toLowerCase() !== normalized) {
      // Add primary name if it differs from input (e.g., exact capitalization)
      aliases.add(best.name);
    }

    // Aliases with CJK characters
    for (const alias of best.aliases ?? []) {
      if (CJK_RE.test(alias.name)) {
        aliases.add(alias.name);
      }
    }

    const result = [...aliases];

    // Cache in KV
    if (kv) {
      kv.put(cacheKey, JSON.stringify(result), {
        expirationTtl: result.length > 0 ? MB_CACHE_TTL : MB_EMPTY_TTL,
      }).catch(() => {});
    }

    return result;
  } catch {
    // Network error, timeout, etc.
    return [];
  }
}

function cacheEmpty(kv: KVNamespace | undefined, cacheKey: string): void {
  if (kv) {
    kv.put(cacheKey, "[]", { expirationTtl: MB_EMPTY_TTL }).catch(() => {});
  }
}
