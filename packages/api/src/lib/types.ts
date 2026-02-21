export type Platform = "spotify" | "youtube";

export interface ParsedPlaylistUrl {
  platform: Platform;
  playlistId: string;
}

export interface PlaylistTrack {
  title: string;
  artist: string;
  originalTitle: string;
}

export interface PlaylistResult {
  platform: Platform;
  playlistName: string;
  tracks: PlaylistTrack[];
}

export interface KaraokeMatch {
  no: string;
  matchedTitle: string;
  matchedSinger: string;
  score: number;
}

export interface KaraokeResult {
  title: string;
  artist: string;
  tj: KaraokeMatch | null;
  ky: KaraokeMatch | null;
  joysound: KaraokeMatch | null;
}

export interface MananaEntry {
  brand: string;
  no: string;
  title: string;
  singer: string;
  composer: string;
  lyricist: string;
  release: string;
}

export type Env = {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  YOUTUBE_API_KEY: string;
  KARAOKE_CACHE: KVNamespace;
};
