import { PlaylistTrack } from "./types";

const INNERTUBE_URL = "https://music.youtube.com/youtubei/v1/browse";

const CLIENT_CONTEXT = {
  client: {
    clientName: "WEB_REMIX",
    clientVersion: "1.20240101.01.00",
    hl: "en",
    gl: "US",
  },
};

interface FlexColumnRun {
  text: string;
}

interface FlexColumn {
  musicResponsiveListItemFlexColumnRenderer?: {
    text?: { runs?: FlexColumnRun[] };
  };
}

interface MusicListItem {
  musicResponsiveListItemRenderer?: {
    flexColumns?: FlexColumn[];
  };
}

export async function getYouTubeMusicPlaylist(
  playlistId: string,
): Promise<{ name: string; tracks: PlaylistTrack[] }> {
  const res = await fetch(INNERTUBE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://music.youtube.com",
      Referer: "https://music.youtube.com/",
    },
    body: JSON.stringify({
      browseId: `VL${playlistId}`,
      context: CLIENT_CONTEXT,
    }),
  });

  if (!res.ok) {
    throw new Error(`YouTube Music API error: ${res.status}`);
  }

  const data = await res.json<Record<string, unknown>>();

  // Check if playlist is accessible
  const contents = (data as any)?.contents?.twoColumnBrowseResultsRenderer;
  if (!contents) {
    throw new Error("Playlist not found or is private.");
  }

  // Extract playlist name
  let name = "YouTube Music Playlist";
  const headerRenderer =
    contents?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents?.[0]?.musicResponsiveHeaderRenderer;
  if (headerRenderer?.title?.runs?.[0]?.text) {
    name = headerRenderer.title.runs[0].text;
  }

  // Extract track items
  const shelf =
    contents?.secondaryContents?.sectionListRenderer?.contents?.[0]
      ?.musicPlaylistShelfRenderer;

  const items: MusicListItem[] = shelf?.contents ?? [];

  if (items.length === 0) {
    throw new Error("No tracks found in YouTube Music playlist.");
  }

  const tracks: PlaylistTrack[] = [];

  for (const item of items) {
    const renderer = item.musicResponsiveListItemRenderer;
    if (!renderer?.flexColumns) continue;

    const titleRuns =
      renderer.flexColumns[0]
        ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    const artistRuns =
      renderer.flexColumns[1]
        ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;

    const title = titleRuns?.map((r) => r.text).join("") ?? "";
    const artist = artistRuns?.map((r) => r.text).join("") ?? "";

    if (!title) continue;

    tracks.push({
      originalTitle: title,
      title,
      artist,
    });
  }

  return { name, tracks };
}
