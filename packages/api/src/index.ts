import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env, PlaylistTrack, MananaEntry } from "./lib/types";
import { parsePlaylistUrl } from "./lib/url-parser";
import { getSpotifyPlaylist } from "./lib/spotify";
import { getYouTubeMusicPlaylist } from "./lib/youtube-music";
import { getAppleMusicPlaylist } from "./lib/apple-music";
import { lookupKaraokeBatch, lookupKaraokeStream, fetchMananaRaw } from "./lib/karaoke";
import { crawlTJ } from "./lib/tj-crawler";
import { isJpopSong } from "./lib/jpop-filter";
import { syncJpopReleases, KV_KEY as JPOP_RELEASES_KEY, JpopRelease } from "./lib/mastodon-releases";
import { ensureKoColumns, getUntranslatedJpopSongs, updateTitleKoBatch, updateSingerKoBatch, searchTJSongs } from "./lib/tj-db";
import { translateToKorean } from "./lib/deepl";
import { streamSSE } from "hono/streaming";
import { MAX_PLAYLIST_TRACKS } from "./lib/constants";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (
        origin.endsWith(".github.io") ||
        origin.startsWith("http://localhost:")
      ) {
        return origin;
      }
      return null;
    },
  }),
);

app.get("/", (c) => c.json({ status: "ok", service: "noraebang-api" }));

// Extract tracks from a playlist URL
app.post("/api/playlist", async (c) => {
  try {
    const body = await c.req.json<{ url?: string }>();
    const url = body.url;

    if (!url || typeof url !== "string") {
      return c.json({ error: "Missing URL", code: "MISSING_URL" }, 400);
    }

    const parsed = parsePlaylistUrl(url);

    let result;
    if (parsed.platform === "apple") {
      result = await getAppleMusicPlaylist(parsed.appleUrl!);
    } else if (parsed.platform === "spotify") {
      result = await getSpotifyPlaylist(parsed.playlistId, parsed.spotifyType);
    } else {
      result = await getYouTubeMusicPlaylist(parsed.playlistId);
    }

    if (result.tracks.length > MAX_PLAYLIST_TRACKS) {
      result.tracks = result.tracks.slice(0, MAX_PLAYLIST_TRACKS);
    }

    return c.json({
      platform: parsed.platform,
      playlistName: result.name,
      tracks: result.tracks,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("private")
        ? 403
        : 400;
    return c.json({ error: message, code: "PLAYLIST_ERROR" }, status);
  }
});

// Look up karaoke numbers for tracks
app.post("/api/karaoke", async (c) => {
  try {
    const body = await c.req.json<{ tracks?: PlaylistTrack[] }>();
    const tracks = body.tracks;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return c.json({ error: "No tracks provided", code: "NO_TRACKS" }, 400);
    }

    const limited = tracks.slice(0, MAX_PLAYLIST_TRACKS);
    const results = await lookupKaraokeBatch(limited, c.env.KARAOKE_CACHE, c.env.TJ_DB);

    return c.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message, code: "KARAOKE_ERROR" }, 500);
  }
});

// SSE streaming karaoke lookup
app.post("/api/karaoke/stream", async (c) => {
  try {
    const body = await c.req.json<{ tracks?: PlaylistTrack[] }>();
    const tracks = body.tracks;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return c.json({ error: "No tracks provided", code: "NO_TRACKS" }, 400);
    }

    const limited = tracks.slice(0, MAX_PLAYLIST_TRACKS);
    const kv = c.env.KARAOKE_CACHE;
    const db = c.env.TJ_DB;

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "init",
        data: JSON.stringify({ total: limited.length }),
      });

      await lookupKaraokeStream(limited, kv, async (index, result) => {
        await stream.writeSSE({
          event: "result",
          data: JSON.stringify({ index, result }),
          id: String(index),
        });
      }, db);

      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ total: limited.length }),
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message, code: "KARAOKE_ERROR" }, 500);
  }
});

// Recent J-pop releases (last 7 days, TJ + KY only)
app.get("/api/releases/recent", async (c) => {
  try {
    const kv = c.env.KARAOKE_CACHE;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Primary: bot-synced data from KV
    const cached = await kv?.get<JpopRelease[]>(JPOP_RELEASES_KEY, "json");
    if (cached && cached.length > 0) {
      const releases = cached
        .filter((e) => {
          const d = new Date(e.release);
          return d >= sevenDaysAgo && d <= now;
        })
        .sort((a, b) => b.release.localeCompare(a.release));
      return c.json({ releases });
    }

    // Fallback: Manana API + isJpopSong filter
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    let entries = await fetchMananaRaw(`release/${yyyy}${mm}.json`, kv);

    if (now.getDate() <= 7) {
      const prev = new Date(yyyy, now.getMonth() - 1, 1);
      const prevYyyy = prev.getFullYear();
      const prevMm = String(prev.getMonth() + 1).padStart(2, "0");
      const prevEntries = await fetchMananaRaw(
        `release/${prevYyyy}${prevMm}.json`,
        kv,
      );
      entries = [...prevEntries, ...entries];
    }

    const releases = entries
      .filter((e: MananaEntry) => {
        if (e.brand !== "tj" && e.brand !== "kumyoung") return false;
        const d = new Date(e.release);
        if (d < sevenDaysAgo || d > now) return false;
        return isJpopSong(e.singer, e.title);
      })
      .sort((a: MananaEntry, b: MananaEntry) =>
        b.release.localeCompare(a.release),
      )
      .slice(0, 100);

    return c.json({ releases });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message, code: "RELEASE_ERROR" }, 500);
  }
});

// Search TJ songs by title or Korean translation
app.get("/api/search", async (c) => {
  try {
    const q = c.req.query("q")?.trim();
    if (!q || q.length < 2) {
      return c.json({ results: [] });
    }
    const results = await searchTJSongs(c.env.TJ_DB, q, 20);
    return c.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message, code: "SEARCH_ERROR" }, 500);
  }
});

const POPULAR_ARTISTS = [
  // Kpop
  "방탄소년단", "블랙핑크", "트와이스", "아이유", "에스파",
  "스트레이키즈", "세븐틴", "뉴진스", "르세라핌", "있지",
  "엔하이픈", "엑소", "레드벨벳", "빅뱅", "샤이니",
  "소녀시대", "슈퍼주니어", "투모로우바이투게더", "에이티즈",
  "싸이", "지드래곤", "태연", "로제", "지민", "정국",
  "리사", "제니", "화사", "헤이즈", "크러쉬", "딘",
  "지코", "박재범",
  // Jpop
  "YOASOBI", "Ado", "米津玄師", "Official髭男dism",
  "back number", "あいみょん", "King Gnu", "優里",
  "Mrs. GREEN APPLE", "藤井風",
  // Western
  "Taylor Swift", "Ed Sheeran", "Adele", "Bruno Mars",
  "Billie Eilish", "The Weeknd", "Dua Lipa", "Harry Styles",
  "Olivia Rodrigo", "Charlie Puth",
];

export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ) => {
    const kv = env.KARAOKE_CACHE;
    if (!kv) return;

    // Crawl TJ website and populate D1 database
    if (env.TJ_DB) {
      await crawlTJ(env.TJ_DB, kv);
    }

    // Sync J-pop releases from Mastodon bot
    if (env.TJ_DB) {
      await syncJpopReleases(env.TJ_DB, kv, env.DEEPL_API_KEY);
    }

    // Ensure ko columns exist + populate singer_ko from mapping
    if (env.TJ_DB) {
      await ensureKoColumns(env.TJ_DB);
      await updateSingerKoBatch(env.TJ_DB);
    }

    // Batch translate untranslated J-pop songs
    if (env.TJ_DB && env.DEEPL_API_KEY) {
      const untranslated = await getUntranslatedJpopSongs(env.TJ_DB, 50);
      if (untranslated.length > 0) {
        const titles = untranslated.map((s) => s.title);
        const translated = await translateToKorean(titles, env.DEEPL_API_KEY);
        const updates: { no: string; titleKo: string }[] = [];
        for (let i = 0; i < untranslated.length; i++) {
          if (translated[i] !== titles[i]) {
            updates.push({ no: untranslated[i].no, titleKo: translated[i] });
          }
        }
        if (updates.length > 0) {
          await updateTitleKoBatch(env.TJ_DB, updates);
        }
      }
    }

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Precache popular artist catalogs
    for (const artist of POPULAR_ARTISTS) {
      await fetchMananaRaw(`singer/${encodeURIComponent(artist)}.json`, kv);
      await delay(200);
    }

    // Fetch recent monthly releases and precache those artists
    const now = new Date();
    const months: string[] = [];
    for (let offset = 0; offset <= 1; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      months.push(`${yyyy}${mm}`);
    }

    const seenArtists = new Set(POPULAR_ARTISTS);

    for (const month of months) {
      try {
        const entries = await fetchMananaRaw(`release/${month}.json`, kv);
        const uniqueArtists = new Set(entries.map((e: MananaEntry) => e.singer));
        for (const artist of uniqueArtists) {
          if (seenArtists.has(artist)) continue;
          seenArtists.add(artist);
          await fetchMananaRaw(
            `singer/${encodeURIComponent(artist)}.json`,
            kv,
          );
          await delay(200);
        }
      } catch {
        // Skip failed month
      }
    }
  },
};
