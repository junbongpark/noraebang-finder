import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env, PlaylistTrack, MananaEntry } from "./lib/types";
import { parsePlaylistUrl } from "./lib/url-parser";
import { getSpotifyPlaylist } from "./lib/spotify";
import { getYouTubeMusicPlaylist } from "./lib/youtube-music";
import { getAppleMusicPlaylist } from "./lib/apple-music";
import { lookupKaraokeBatch, lookupKaraokeStream, fetchMananaRaw } from "./lib/karaoke";
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
    const results = await lookupKaraokeBatch(limited, c.env.KARAOKE_CACHE);

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
      });

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
