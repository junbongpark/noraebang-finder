import { useState, useCallback, useRef } from "react";
import { PlaylistTrack, KaraokeResult } from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "";

type Phase = "idle" | "extracting" | "streaming" | "done" | "error";

interface State {
  phase: Phase;
  platform: string | null;
  playlistName: string | null;
  tracks: PlaylistTrack[];
  results: (KaraokeResult | null)[];
  progress: { completed: number; total: number };
  error: string | null;
}

const initialState: State = {
  phase: "idle",
  platform: null,
  playlistName: null,
  tracks: [],
  results: [],
  progress: { completed: 0, total: 0 },
  error: null,
};

export function usePlaylistConvert() {
  const [state, setState] = useState<State>(initialState);

  const resultsRef = useRef<(KaraokeResult | null)[]>([]);
  const completedRef = useRef(0);
  const lastFlushRef = useRef(0);
  const pendingCountRef = useRef(0);

  const flush = useCallback(() => {
    setState((prev) => ({
      ...prev,
      results: [...resultsRef.current],
      progress: { completed: completedRef.current, total: prev.progress.total },
    }));
    pendingCountRef.current = 0;
    lastFlushRef.current = Date.now();
  }, []);

  const convert = useCallback(
    async (url: string) => {
      setState({ ...initialState, phase: "extracting" });
      resultsRef.current = [];
      completedRef.current = 0;
      pendingCountRef.current = 0;
      lastFlushRef.current = 0;

      try {
        const playlistRes = await fetch(`${API_BASE}/api/playlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });

        if (!playlistRes.ok) {
          const err = await playlistRes.json();
          throw new Error(err.error || "플레이리스트를 가져올 수 없습니다");
        }

        const playlistData = await playlistRes.json();
        const trackCount = playlistData.tracks.length;

        resultsRef.current = new Array(trackCount).fill(null);

        setState((prev) => ({
          ...prev,
          phase: "streaming",
          platform: playlistData.platform,
          playlistName: playlistData.playlistName,
          tracks: playlistData.tracks,
          results: new Array(trackCount).fill(null),
          progress: { completed: 0, total: trackCount },
        }));

        const response = await fetch(`${API_BASE}/api/karaoke/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracks: playlistData.tracks }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "노래방 번호 검색에 실패했습니다");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (eventType === "result") {
                resultsRef.current[data.index] = data.result;
                completedRef.current++;
                pendingCountRef.current++;

                const now = Date.now();
                if (
                  pendingCountRef.current >= 5 ||
                  now - lastFlushRef.current >= 200
                ) {
                  flush();
                }
              } else if (eventType === "init") {
                setState((prev) => ({
                  ...prev,
                  progress: { ...prev.progress, total: data.total },
                }));
              } else if (eventType === "done") {
                flush();
                setState((prev) => ({
                  ...prev,
                  phase: "done",
                  results: [...resultsRef.current],
                  progress: {
                    completed: completedRef.current,
                    total: prev.progress.total,
                  },
                }));
              }
            }
          }
        }

        // Final flush in case stream ended without a done event
        setState((prev) => {
          if (prev.phase === "done") return prev;
          return {
            ...prev,
            phase: "done",
            results: [...resultsRef.current],
            progress: { completed: completedRef.current, total: prev.progress.total },
          };
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: "error",
          error:
            err instanceof Error ? err.message : "문제가 발생했습니다",
        }));
      }
    },
    [flush],
  );

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { ...state, convert, reset };
}
