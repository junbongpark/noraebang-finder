import { useState, useCallback } from "react";
import { PlaylistTrack, KaraokeResult } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "";

type Phase = "idle" | "extracting" | "looking_up" | "done" | "error";

interface State {
  phase: Phase;
  platform: string | null;
  playlistName: string | null;
  tracks: PlaylistTrack[];
  results: KaraokeResult[];
  error: string | null;
}

const initialState: State = {
  phase: "idle",
  platform: null,
  playlistName: null,
  tracks: [],
  results: [],
  error: null,
};

export function usePlaylistConvert() {
  const [state, setState] = useState<State>(initialState);

  const convert = useCallback(async (url: string) => {
    setState({ ...initialState, phase: "extracting" });

    try {
      const playlistRes = await fetch(`${API_BASE}/api/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!playlistRes.ok) {
        const err = await playlistRes.json();
        throw new Error(err.error || "Failed to extract playlist");
      }

      const playlistData = await playlistRes.json();

      setState((prev) => ({
        ...prev,
        phase: "looking_up",
        platform: playlistData.platform,
        playlistName: playlistData.playlistName,
        tracks: playlistData.tracks,
      }));

      const karaokeRes = await fetch(`${API_BASE}/api/karaoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: playlistData.tracks }),
      });

      if (!karaokeRes.ok) {
        const err = await karaokeRes.json();
        throw new Error(err.error || "Failed to look up karaoke numbers");
      }

      const karaokeData = await karaokeRes.json();

      setState((prev) => ({
        ...prev,
        phase: "done",
        results: karaokeData.results,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: err instanceof Error ? err.message : "Something went wrong",
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { ...state, convert, reset };
}
