import { YOUTUBE_API_URL } from "./constants";
import { PlaylistTrack } from "./types";

export async function getYouTubePlaylist(
  playlistId: string,
  apiKey: string,
): Promise<{ name: string; tracks: PlaylistTrack[] }> {
  const metaRes = await fetch(
    `${YOUTUBE_API_URL}/playlists?part=snippet&id=${playlistId}&key=${apiKey}`,
  );
  if (!metaRes.ok) throw new Error(`YouTube API error: ${metaRes.status}`);
  const metaData: { items?: Array<{ snippet: { title: string } }> } =
    await metaRes.json();
  if (!metaData.items?.length) throw new Error("Playlist not found.");
  const playlistName = metaData.items[0].snippet.title;

  const tracks: PlaylistTrack[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId,
      maxResults: "50",
      key: apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${YOUTUBE_API_URL}/playlistItems?${params}`);
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const data: {
      items: Array<{
        snippet: { title: string; videoOwnerChannelTitle?: string };
      }>;
      nextPageToken?: string;
    } = await res.json();

    for (const item of data.items) {
      const rawTitle = item.snippet.title;
      const channel = item.snippet.videoOwnerChannelTitle ?? "";
      if (rawTitle === "Deleted video" || rawTitle === "Private video") continue;

      const parsed = parseYoutubeTitle(rawTitle, channel);
      tracks.push({
        originalTitle: rawTitle,
        title: parsed.title,
        artist: parsed.artist,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { name: playlistName, tracks };
}

function parseYoutubeTitle(
  rawTitle: string,
  channel: string,
): { title: string; artist: string } {
  const dashIndex = rawTitle.indexOf(" - ");
  if (dashIndex > 0) {
    return {
      artist: rawTitle.slice(0, dashIndex).trim(),
      title: rawTitle.slice(dashIndex + 3).trim(),
    };
  }

  const cleanChannel = channel
    .replace(/ - Topic$/, "")
    .replace(/ Official$/, "")
    .replace(/VEVO$/i, "")
    .trim();

  return { title: rawTitle, artist: cleanChannel };
}
