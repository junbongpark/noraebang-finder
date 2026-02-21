import PlaylistInput from "./components/PlaylistInput";
import TrackTable from "./components/TrackTable";
import ExportButton from "./components/ExportButton";
import LoadingState from "./components/LoadingState";
import ErrorBanner from "./components/ErrorBanner";
import { usePlaylistConvert } from "./hooks/usePlaylistConvert";

export default function App() {
  const { phase, platform, playlistName, tracks, results, error, convert, reset } =
    usePlaylistConvert();

  const isLoading = phase === "extracting" || phase === "looking_up";

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-4 py-8 font-sans dark:bg-zinc-900">
      <main className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Noraebang Finder
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Paste a playlist link, get karaoke numbers for TJ, KY, and Joysound
          </p>
        </div>

        <PlaylistInput onSubmit={convert} isLoading={isLoading} />

        {phase === "error" && error && (
          <div className="mt-4">
            <ErrorBanner message={error} onDismiss={reset} />
          </div>
        )}

        {isLoading && (
          <LoadingState
            phase={phase as "extracting" | "looking_up"}
            trackCount={tracks.length}
          />
        )}

        {phase === "done" && results.length > 0 && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  {playlistName}
                </h2>
                <p className="text-sm text-zinc-500">
                  {platform === "spotify" ? "Spotify" : "YouTube"} &middot;{" "}
                  {results.length} tracks
                </p>
              </div>
              <ExportButton
                results={results}
                playlistName={playlistName || "karaoke"}
              />
            </div>
            <TrackTable results={results} />
          </div>
        )}

        <footer className="mt-12 text-center text-xs text-zinc-400">
          <p>
            Karaoke data from{" "}
            <a
              href="https://api.manana.kr"
              className="underline hover:text-zinc-600"
              target="_blank"
              rel="noopener noreferrer"
            >
              API Manana
            </a>
            . Numbers may vary from actual machines.
          </p>
        </footer>
      </main>
    </div>
  );
}
