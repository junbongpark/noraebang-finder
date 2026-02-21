import { useState } from "react";
import { KaraokeResult } from "../types";

interface Props {
  index: number;
  result: KaraokeResult;
}

function KaraokeBadge({
  label,
  match,
}: {
  label: string;
  match: KaraokeResult["tj"];
}) {
  const [copied, setCopied] = useState(false);

  if (!match) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
        <span className="font-medium">{label}</span> -
      </span>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(match.no);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      title={`${match.matchedTitle} - ${match.matchedSinger}`}
      className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs transition hover:bg-indigo-100 active:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50"
    >
      <span className="font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
        {copied ? "Copied!" : match.no}
      </span>
    </button>
  );
}

function DesktopRow({ index, result }: Props) {
  const hasAny = result.tj || result.ky || result.joysound;
  return (
    <tr
      className={`hidden border-b border-zinc-100 dark:border-zinc-800 sm:table-row ${!hasAny ? "opacity-50" : ""}`}
    >
      <td className="px-3 py-2 text-center text-sm text-zinc-400">
        {index + 1}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2 text-sm font-medium">
        {result.title}
      </td>
      <td className="max-w-[150px] truncate px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">
        {result.artist}
      </td>
      <td className="px-3 py-2 text-center">
        <KaraokeBadge label="TJ" match={result.tj} />
      </td>
      <td className="px-3 py-2 text-center">
        <KaraokeBadge label="KY" match={result.ky} />
      </td>
      <td className="px-3 py-2 text-center">
        <KaraokeBadge label="JS" match={result.joysound} />
      </td>
    </tr>
  );
}

function MobileCard({ index, result }: Props) {
  const hasAny = result.tj || result.ky || result.joysound;
  return (
    <div
      className={`border-b border-zinc-100 px-3 py-3 dark:border-zinc-800 sm:hidden ${!hasAny ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-xs text-zinc-400">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{result.title}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {result.artist}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <KaraokeBadge label="TJ" match={result.tj} />
            <KaraokeBadge label="KY" match={result.ky} />
            <KaraokeBadge label="JS" match={result.joysound} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TrackRow({ index, result }: Props) {
  return (
    <>
      <DesktopRow index={index} result={result} />
      <MobileCard index={index} result={result} />
    </>
  );
}
