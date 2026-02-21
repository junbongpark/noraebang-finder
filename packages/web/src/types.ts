export interface PlaylistTrack {
  title: string;
  artist: string;
  originalTitle: string;
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
