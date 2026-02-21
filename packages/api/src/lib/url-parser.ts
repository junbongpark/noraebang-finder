import { ParsedPlaylistUrl } from "./types";

const SPOTIFY_PATTERNS = [
  /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  /^spotify:playlist:([a-zA-Z0-9]+)$/,
];

export function parsePlaylistUrl(url: string): ParsedPlaylistUrl {
  const trimmed = url.trim();

  for (const pattern of SPOTIFY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { platform: "spotify", playlistId: match[1] };
    }
  }

  try {
    const parsed = new URL(trimmed);
    const isYouTube =
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("youtu.be");
    if (isYouTube) {
      const listId = parsed.searchParams.get("list");
      if (listId) {
        return { platform: "youtube", playlistId: listId };
      }
    }
  } catch {
    // not a valid URL
  }

  throw new Error(
    "Unsupported URL. Please paste a Spotify or YouTube playlist link.",
  );
}
