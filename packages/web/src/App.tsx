import { useState } from "react";
import PlaylistInput from "./components/PlaylistInput";
import TrackTable from "./components/TrackTable";
import NumberListView from "./components/NumberListView";
import ExportButton from "./components/ExportButton";
import LoadingState from "./components/LoadingState";
import ErrorBanner from "./components/ErrorBanner";
import HowItWorks from "./components/HowItWorks";
import NewReleases from "./components/NewReleases";
import SearchBar from "./components/SearchBar";
import { usePlaylistConvert } from "./hooks/usePlaylistConvert";
import { KaraokeResult } from "./types";

export default function App() {
  const {
    phase,
    platform,
    playlistName,
    tracks,
    results,
    progress,
    error,
    convert,
    reset,
  } = usePlaylistConvert();

  const [viewMode, setViewMode] = useState<"numbers" | "table">("numbers");
  const isLoading = phase === "extracting" || phase === "streaming";
  const showResults =
    (phase === "streaming" || phase === "done") && results.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-900 px-4 py-8 font-sans text-white">
      <main className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Jpop 노래방 번호 찾기
          </h1>
          <p className="mt-2 text-zinc-400">
            Jpop 플레이리스트로 TJ/금영/Joysound 번호 한번에
          </p>
        </div>

        <PlaylistInput onSubmit={(url) => convert(url)} isLoading={isLoading} />

        {phase === "idle" && (
          <>
            <HowItWorks />
            <SearchBar />
            <NewReleases />
          </>
        )}

        {phase === "error" && error && (
          <div className="mt-4">
            <ErrorBanner message={error} onDismiss={reset} />
          </div>
        )}

        {phase === "extracting" && (
          <LoadingState phase="extracting" trackCount={0} />
        )}

        {phase === "streaming" && (
          <LoadingState
            phase="streaming"
            trackCount={tracks.length}
            progress={progress}
          />
        )}

        {showResults && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {playlistName}
                </h2>
                <p className="text-sm text-zinc-500">
                  {platform === "spotify" ? "Spotify" : platform === "apple" ? "Apple Music" : "YouTube Music"} &middot;{" "}
                  {tracks.length}곡
                </p>
              </div>
              <div className="flex items-center gap-2">
                {phase === "done" && (
                  <ExportButton
                    results={results.filter(
                      (r): r is KaraokeResult => r !== null,
                    )}
                    playlistName={playlistName || "karaoke"}
                  />
                )}
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-1">
              <button
                onClick={() => setViewMode("numbers")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === "numbers"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                번호 보기
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === "table"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                전체 보기
              </button>
            </div>

            {viewMode === "numbers" ? (
              <NumberListView results={results} streaming={phase === "streaming"} />
            ) : (
              <TrackTable results={results} streaming={phase === "streaming"} />
            )}
          </div>
        )}

        <footer className="mt-12 text-center text-xs text-zinc-500">
          <p>
            노래방 데이터 제공:{" "}
            <a
              href="https://api.manana.kr"
              className="underline hover:text-zinc-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              API Manana
            </a>
            . 실제 기기와 번호가 다를 수 있습니다.
          </p>
        </footer>
      </main>
    </div>
  );
}
