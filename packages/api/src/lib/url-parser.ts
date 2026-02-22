import { ParsedPlaylistUrl } from "./types";

const SPOTIFY_PATTERNS = [
  /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/,
  /^spotify:(playlist|album):([a-zA-Z0-9]+)$/,
];

export function parsePlaylistUrl(url: string): ParsedPlaylistUrl {
  const trimmed = url.trim();

  for (const pattern of SPOTIFY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { platform: "spotify", playlistId: match[2], spotifyType: match[1] as "playlist" | "album" };
    }
  }

  // Apple Music
  const appleMatch = trimmed.match(
    /^(?:https?:\/\/)?music\.apple\.com\/[a-z]{2}\/(?:playlist|album)\/.+\/([a-zA-Z0-9.]+)/,
  );
  if (appleMatch) {
    return { platform: "apple", playlistId: appleMatch[1], appleUrl: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    const isYouTubeMusic = parsed.hostname === "music.youtube.com";
    const isYouTube =
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("youtu.be");
    if (isYouTube) {
      const listId = parsed.searchParams.get("list");
      if (listId) {
        return {
          platform: "youtube-music",
          playlistId: listId,
        };
      }
    }
  } catch {
    // not a valid URL
  }

  throw new Error(
    "Unsupported URL. Please paste a Spotify, YouTube Music, or Apple Music link.",
  );
}
