import { useState } from "react";
import { KaraokeResult, KaraokeMatch } from "../types";

interface Props {
  index: number;
  result: KaraokeResult | null;
}

function KaraokeBadge({
  label,
  match,
}: {
  label: string;
  match: KaraokeMatch | null | undefined;
}) {
  const [copied, setCopied] = useState(false);

  if (!match) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <span className="font-medium">{label}</span> -
      </span>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(match.no);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <button
      onClick={handleCopy}
      title={`${match.matchedTitle} - ${match.matchedSinger}`}
      className="inline-flex items-center gap-1 rounded-md bg-indigo-900/30 px-2 py-0.5 text-xs transition hover:bg-indigo-900/50 active:bg-indigo-900/60"
    >
      <span className="font-medium text-zinc-400">{label}</span>
      <span className="font-mono font-semibold text-indigo-400">
        {copied ? "복사됨" : match.no}
      </span>
    </button>
  );
}

function KaraokeCard({
  label,
  match,
}: {
  label: string;
  match: KaraokeMatch | null | undefined;
}) {
  const [copied, setCopied] = useState(false);

  if (!match) {
    return (
      <div className="flex flex-1 flex-col items-center rounded-lg bg-zinc-800/50 px-2 py-2">
        <span className="text-[10px] font-medium uppercase text-zinc-500">
          {label}
        </span>
        <span className="font-mono text-lg text-zinc-600">-</span>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(match.no);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <button
      onClick={handleCopy}
      title={`${match.matchedTitle} - ${match.matchedSinger}`}
      className="flex flex-1 flex-col items-center rounded-lg bg-indigo-900/30 px-2 py-2 transition active:bg-indigo-900/50"
    >
      <span className="text-[10px] font-medium uppercase text-indigo-400">
        {label}
      </span>
      <span className="font-mono text-lg font-bold text-indigo-300">
        {copied ? "복사됨" : match.no}
      </span>
    </button>
  );
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <>
      <tr className="hidden border-b border-zinc-800 sm:table-row">
        <td className="px-3 py-2 text-center text-sm text-zinc-600">
          {index + 1}
        </td>
        <td className="px-3 py-2">
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-700" />
        </td>
        <td className="px-3 py-2">
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-700" />
        </td>
        <td className="px-3 py-2">
          <div className="mx-auto h-4 w-16 animate-pulse rounded bg-zinc-700" />
        </td>
        <td className="px-3 py-2">
          <div className="mx-auto h-4 w-16 animate-pulse rounded bg-zinc-700" />
        </td>
        <td className="px-3 py-2">
          <div className="mx-auto h-4 w-16 animate-pulse rounded bg-zinc-700" />
        </td>
      </tr>
      <div className="border-b border-zinc-800 px-3 py-3 sm:hidden">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-xs text-zinc-600">{index + 1}</span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-700" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-700" />
            <div className="flex gap-2">
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-zinc-800" />
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-zinc-800" />
              <div className="h-12 flex-1 animate-pulse rounded-lg bg-zinc-800" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopRow({ index, result }: { index: number; result: KaraokeResult }) {
  const hasAny = result.tj || result.ky || result.joysound;
  return (
    <tr
      className={`hidden border-b border-zinc-800 sm:table-row ${!hasAny ? "opacity-40" : ""}`}
    >
      <td className="px-3 py-2 text-center text-sm text-zinc-400">
        {index + 1}
      </td>
      <td className="max-w-[200px] truncate px-3 py-2 text-sm font-medium">
        {result.title}
      </td>
      <td className="max-w-[150px] truncate px-3 py-2 text-sm text-zinc-400">
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

function MobileCard({ index, result }: { index: number; result: KaraokeResult }) {
  const hasAny = result.tj || result.ky || result.joysound;
  return (
    <div
      className={`border-b border-zinc-800 px-3 py-3 sm:hidden ${!hasAny ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-xs text-zinc-400">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{result.title}</p>
          <p className="truncate text-xs text-zinc-400">{result.artist}</p>
          <div className="mt-1.5 flex gap-2">
            <KaraokeCard label="TJ" match={result.tj} />
            <KaraokeCard label="KY" match={result.ky} />
            <KaraokeCard label="JS" match={result.joysound} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TrackRow({ index, result }: Props) {
  if (result === null) {
    return <SkeletonRow index={index} />;
  }

  return (
    <>
      <DesktopRow index={index} result={result} />
      <MobileCard index={index} result={result} />
    </>
  );
}
