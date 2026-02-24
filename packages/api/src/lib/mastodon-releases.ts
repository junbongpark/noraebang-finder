import { searchTJ, matchDirect } from "./direct-search";
import { saveTJResults, getTitleKo, updateTitleKoBatch } from "./tj-db";
import { fetchMananaRaw } from "./karaoke";
import { translateToKorean } from "./deepl";
import { MananaEntry } from "./types";

const MASTODON_ACCOUNT_ID = "109797204938216927";
const MASTODON_API = "https://planet.moe/api/v1";
const KV_KEY = "jpop-releases";
const KV_TTL = 30 * 24 * 60 * 60; // 30 days

export interface JpopRelease {
  brand: string;
  no: string;
  title: string;
  titleKo?: string;
  singer: string;
  release: string;
}

interface MastodonPost {
  created_at: string;
  content: string;
  tags: { name: string }[];
}

interface ParsedPost {
  date: string;
  brand: "tj" | "kumyoung";
  titles: string[];
}

/** Fetch recent posts from the karaoke_jpop Mastodon bot */
async function fetchBotPosts(): Promise<MastodonPost[]> {
  const url = `${MASTODON_API}/accounts/${MASTODON_ACCOUNT_ID}/statuses?limit=20`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NoraebangFinder/1.0)" },
  });
  if (!res.ok) return [];
  return res.json();
}

/** Parse a Mastodon post into brand + song titles */
function parsePost(post: MastodonPost): ParsedPost | null {
  // Skip monthly summary posts
  if (post.tags.some((t) => t.name === "신곡일람")) return null;

  // Strip HTML tags from content
  const text = post.content
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

  // Split by # and extract parts
  const parts = text
    .split("#")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  // First part = brand
  const brandText = parts[0].toLowerCase();
  let brand: "tj" | "kumyoung";
  if (brandText.includes("tj")) {
    brand = "tj";
  } else if (brandText.includes("금영")) {
    brand = "kumyoung";
  } else {
    return null;
  }

  // Remaining parts = song titles
  const titles = parts.slice(1).map(cleanTitle).filter(Boolean);
  if (titles.length === 0) return null;

  const date = post.created_at.slice(0, 10);
  return { date, brand, titles };
}

/** Clean a raw title extracted from post text */
function cleanTitle(raw: string): string {
  let title = raw.trim();
  // Replace __ with space (e.g. コトノハ__Kotonoha → コトノハ Kotonoha)
  title = title.replace(/__/g, " ");
  // Replace _ with space (e.g. dead_beats → dead beats)
  title = title.replace(/_/g, " ");
  // Remove trailing period/space artifacts
  title = title.replace(/\s*\.\s*$/, "").trim();
  return title;
}

/** Resolve a song title to full song info via D1/TJ search/Manana */
async function resolveTitle(
  title: string,
  brand: "tj" | "kumyoung",
  date: string,
  db: D1Database,
  kv: KVNamespace,
): Promise<JpopRelease | null> {
  if (brand === "tj") {
    return resolveTJ(title, date, db);
  }
  return resolveKY(title, date, kv);
}

async function resolveTJ(
  title: string,
  date: string,
  db: D1Database,
): Promise<JpopRelease | null> {
  // Search D1 database
  try {
    const { results } = await db
      .prepare("SELECT no, title, singer FROM tj_songs WHERE title LIKE ?")
      .bind(`%${title}%`)
      .all<{ no: string; title: string; singer: string }>();

    if (results && results.length > 0) {
      const match = matchDirect(title, "", results);
      if (match) {
        const titleKo = await getTitleKo(db, match.no);
        return {
          brand: "tj",
          no: match.no,
          title: match.matchedTitle,
          titleKo: titleKo ?? undefined,
          singer: match.matchedSinger,
          release: date,
        };
      }
    }
  } catch {
    // D1 search failed, try direct search
  }

  // Fallback: TJ website direct search
  try {
    const directResults = await searchTJ(title);
    if (directResults.length > 0) {
      // Save to D1 for future lookups
      await saveTJResults(db, directResults).catch(() => {});
      const match = matchDirect(title, "", directResults);
      if (match) {
        return {
          brand: "tj",
          no: match.no,
          title: match.matchedTitle,
          singer: match.matchedSinger,
          release: date,
        };
      }
    }
  } catch {
    // Direct search also failed
  }

  return null;
}

async function resolveKY(
  title: string,
  date: string,
  kv: KVNamespace,
): Promise<JpopRelease | null> {
  try {
    const entries = await fetchMananaRaw(
      `song/${encodeURIComponent(title)}.json`,
      kv,
    );
    const kyEntry = entries.find(
      (e: MananaEntry) => e.brand === "kumyoung",
    );
    if (kyEntry) {
      return {
        brand: "kumyoung",
        no: kyEntry.no,
        title: kyEntry.title,
        singer: kyEntry.singer,
        release: date,
      };
    }
  } catch {
    // Manana search failed
  }
  return null;
}

/** Main sync function: fetch bot posts → resolve → translate → store in KV */
export async function syncJpopReleases(
  db: D1Database,
  kv: KVNamespace,
  deeplApiKey?: string,
): Promise<void> {
  const posts = await fetchBotPosts();
  if (posts.length === 0) return;

  // Load existing releases from KV
  let existing: JpopRelease[] = [];
  try {
    existing = (await kv.get<JpopRelease[]>(KV_KEY, "json")) ?? [];
  } catch {}

  // Track existing entries to avoid duplicates
  const existingKeys = new Set(existing.map((r) => `${r.brand}:${r.no}`));

  const newReleases: JpopRelease[] = [];

  for (const post of posts) {
    const parsed = parsePost(post);
    if (!parsed) continue;

    for (const title of parsed.titles) {
      const resolved = await resolveTitle(
        title,
        parsed.brand,
        parsed.date,
        db,
        kv,
      );
      if (resolved && !existingKeys.has(`${resolved.brand}:${resolved.no}`)) {
        newReleases.push(resolved);
        existingKeys.add(`${resolved.brand}:${resolved.no}`);
      }
    }
  }

  // Translate untranslated new releases via DeepL
  if (deeplApiKey && newReleases.length > 0) {
    const untranslated = newReleases.filter((r) => !r.titleKo);
    if (untranslated.length > 0) {
      const titles = untranslated.map((r) => r.title);
      const translated = await translateToKorean(titles, deeplApiKey);
      const dbUpdates: { no: string; titleKo: string }[] = [];
      for (let i = 0; i < untranslated.length; i++) {
        if (translated[i] !== titles[i]) {
          untranslated[i].titleKo = translated[i];
          dbUpdates.push({ no: untranslated[i].no, titleKo: translated[i] });
        }
      }
      if (dbUpdates.length > 0) {
        await updateTitleKoBatch(db, dbUpdates).catch(() => {});
      }
    }
  }

  if (newReleases.length > 0) {
    const all = [...existing, ...newReleases];
    await kv.put(KV_KEY, JSON.stringify(all), { expirationTtl: KV_TTL });
  }
}

export { KV_KEY };
