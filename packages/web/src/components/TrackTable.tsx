import { KaraokeResult } from "../types";
import TrackRow from "./TrackRow";

interface Props {
  results: (KaraokeResult | null)[];
}

export default function TrackTable({ results }: Props) {
  const resolved = results.filter((r) => r !== null);
  const found = resolved.filter((r) => r.tj || r.ky || r.joysound).length;

  const rows = results.map((r, i) => ({ result: r, index: i }));

  return (
    <div className="w-full">
      <p className="mb-3 text-sm text-zinc-400">
        {results.length}곡 중 {found}곡의 번호를 찾았습니다
      </p>
      <div className="overflow-hidden rounded-lg border border-zinc-700">
        <table className="hidden w-full text-left sm:table">
          <thead>
            <tr className="border-b border-zinc-700 bg-zinc-800/50">
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">
                #
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-zinc-500">
                곡명
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase text-zinc-500">
                아티스트
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">
                TJ
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">
                KY
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-zinc-500">
                Joysound
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ result, index }) => (
              <TrackRow key={index} index={index} result={result} />
            ))}
          </tbody>
        </table>
        <div className="sm:hidden">
          {rows.map(({ result, index }) => (
            <TrackRow key={index} index={index} result={result} />
          ))}
        </div>
      </div>
    </div>
  );
}
