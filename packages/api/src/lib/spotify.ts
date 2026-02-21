import { PlaylistTrack } from "./types";

// Extract tracks from Spotify's embed page — no API key needed.
// The embed page includes __NEXT_DATA__ with the full track list.

interface EmbedTrack {
  title: string;
  subtitle: string;
  uri: string;
}

interface EmbedData {
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            name: string;
            trackList: EmbedTrack[];
          };
        };
      };
    };
  };
}

export async function getSpotifyPlaylist(
  playlistId: string,
): Promise<{ name: string; tracks: PlaylistTrack[] }> {
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const res = await fetch(embedUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NoraebangFinder/1.0)",
    },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Playlist not found.");
    throw new Error(`Spotify error: ${res.status}`);
  }

  const html = await res.text();

  const match = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">(.*?)<\/script>/,
  );
  if (!match) {
    throw new Error("Could not parse Spotify playlist data.");
  }

  const data: EmbedData = JSON.parse(match[1]);
  const entity = data.props.pageProps.state.data.entity;

  const tracks: PlaylistTrack[] = entity.trackList.map((t) => ({
    originalTitle: t.title,
    title: t.title,
    artist: t.subtitle,
  }));

  return { name: entity.name, tracks };
}
