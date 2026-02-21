import { KaraokeResult } from "../types";
import TrackRow from "./TrackRow";

interface Props {
  results: KaraokeResult[];
}

export default function TrackTable({ results }: Props) {
  const found = results.filter((r) => r.tj || r.ky || r.joysound).length;

  return (
    <div className="w-full">
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        Found karaoke numbers for {found} of {results.length} tracks
      </p>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="hidden w-full text-left sm:table">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">#</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-zinc-500">Track</th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-zinc-500">Artist</th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">TJ</th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">KY</th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">Joysound</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, i) => (
              <TrackRow key={i} index={i} result={result} />
            ))}
          </tbody>
        </table>
        <div className="sm:hidden">
          {results.map((result, i) => (
            <TrackRow key={i} index={i} result={result} />
          ))}
        </div>
      </div>
    </div>
  );
}
