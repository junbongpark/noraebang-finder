import { SPOTIFY_TOKEN_URL, SPOTIFY_API_URL } from "./constants";
import { PlaylistTrack } from "./types";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);

  const data: { access_token: string; expires_in: number } = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

export async function getSpotifyPlaylist(
  playlistId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ name: string; tracks: PlaylistTrack[] }> {
  const token = await getAccessToken(clientId, clientSecret);

  const metaRes = await fetch(
    `${SPOTIFY_API_URL}/playlists/${playlistId}?fields=name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (metaRes.status === 404) throw new Error("Playlist not found.");
  if (metaRes.status === 403)
    throw new Error("Playlist is private. Please make it public and try again.");
  if (!metaRes.ok) throw new Error(`Spotify API error: ${metaRes.status}`);
  const meta: { name: string } = await metaRes.json();

  const tracks: PlaylistTrack[] = [];
  let url: string | null =
    `${SPOTIFY_API_URL}/playlists/${playlistId}/tracks?fields=items(track(name,artists(name))),next&limit=100`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
    const data: {
      items: Array<{
        track: { name: string; artists: Array<{ name: string }> } | null;
      }>;
      next: string | null;
    } = await res.json();

    for (const item of data.items) {
      if (!item.track) continue;
      tracks.push({
        originalTitle: item.track.name,
        title: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(", "),
      });
    }
    url = data.next;
  }

  return { name: meta.name, tracks };
}
