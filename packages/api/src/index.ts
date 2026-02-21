import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env, PlaylistTrack } from "./lib/types";
import { parsePlaylistUrl } from "./lib/url-parser";
import { getSpotifyPlaylist } from "./lib/spotify";
import { getYouTubePlaylist } from "./lib/youtube";
import { lookupKaraokeBatch } from "./lib/karaoke";
import { MAX_PLAYLIST_TRACKS } from "./lib/constants";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

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
    if (parsed.platform === "spotify") {
      result = await getSpotifyPlaylist(parsed.playlistId);
    } else {
      if (!c.env.YOUTUBE_API_KEY) {
        return c.json(
          { error: "YouTube API key not configured", code: "NO_CREDS" },
          401,
        );
      }
      result = await getYouTubePlaylist(parsed.playlistId, c.env.YOUTUBE_API_KEY);
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
    const kv = c.env.KARAOKE_CACHE;
    const results = await lookupKaraokeBatch(limited, kv);

    return c.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: message, code: "KARAOKE_ERROR" }, 500);
  }
});

export default app;
