import PlaylistInput from "./components/PlaylistInput";
import TrackTable from "./components/TrackTable";
import ExportButton from "./components/ExportButton";
import LoadingState from "./components/LoadingState";
import ErrorBanner from "./components/ErrorBanner";
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

  const isLoading = phase === "extracting" || phase === "streaming";
  const showResults =
    (phase === "streaming" || phase === "done") && results.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-900 px-4 py-8 font-sans text-white">
      <main className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            노래방 번호 찾기
          </h1>
          <p className="mt-2 text-zinc-400">
            플레이리스트 링크로 TJ/금영/Joysound 번호 한번에
          </p>
        </div>

        <PlaylistInput onSubmit={convert} isLoading={isLoading} />

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
                  {platform === "spotify" ? "Spotify" : "YouTube"} &middot;{" "}
                  {tracks.length}곡
                </p>
              </div>
              {phase === "done" && (
                <ExportButton
                  results={results.filter(
                    (r): r is KaraokeResult => r !== null,
                  )}
                  playlistName={playlistName || "karaoke"}
                />
              )}
            </div>
            <TrackTable results={results} />
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
