import { useState, useMemo } from "react";
import { KaraokeResult } from "../types";

type Device = "tj" | "ky" | "joysound";

const DEVICE_LABELS: Record<Device, string> = {
  tj: "TJ",
  ky: "금영",
  joysound: "Joysound",
};

interface Props {
  results: (KaraokeResult | null)[];
  streaming?: boolean;
}

export default function NumberListView({ results, streaming }: Props) {
  const [device, setDevice] = useState<Device>("tj");

  const sorted = useMemo(() => {
    const items = results.map((r, i) => ({ result: r, index: i }));
    if (streaming) return { all: items, found: [], notFound: [] };
    const found = items.filter(({ result }) => result !== null && result[device] !== null);
    const notFound = items.filter(({ result }) => result === null || result[device] === null);
    return { all: [], found, notFound };
  }, [results, device, streaming]);

  return (
    <div className="w-full">
      {/* Device tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-zinc-800/50 p-1">
        {(Object.keys(DEVICE_LABELS) as Device[]).map((d) => (
          <button
            key={d}
            onClick={() => setDevice(d)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              device === d
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {DEVICE_LABELS[d]}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="mb-3 text-sm text-zinc-400">
        {streaming ? (
          <>
            {DEVICE_LABELS[device]}에서{" "}
            {sorted.all.filter(({ result }) => result !== null && result[device] !== null).length}곡 찾음
          </>
        ) : (
          <>
            {DEVICE_LABELS[device]}에서 {sorted.found.length}곡 찾음
            {sorted.notFound.length > 0 && (
              <span className="text-zinc-600">
                {" "}/ {sorted.notFound.length}곡 없음
              </span>
            )}
          </>
        )}
      </p>

      {/* Number list */}
      <div className="space-y-1">
        {streaming
          ? sorted.all.map(({ result, index }) => (
              <NumberRow
                key={index}
                result={result}
                device={device}
                index={index}
              />
            ))
          : <>
              {sorted.found.map(({ result, index }) => (
                <NumberRow
                  key={index}
                  result={result}
                  device={device}
                  index={index}
                />
              ))}
              {sorted.notFound.map(({ result, index }) => (
                <NumberRow
                  key={index}
                  result={result}
                  device={device}
                  index={index}
                />
              ))}
            </>}
      </div>
    </div>
  );
}

function NumberRow({
  result,
  device,
  index,
}: {
  result: KaraokeResult | null;
  device: Device;
  index: number;
}) {
  const [copied, setCopied] = useState(false);
  const match = result?.[device] ?? null;

  const handleCopy = async () => {
    if (!match) return;
    try {
      await navigator.clipboard.writeText(match.no);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  // Not found / still loading
  if (!match) {
    return (
      <div className="flex w-full items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-800/20 px-3 py-2.5 opacity-40">
        <span className="min-w-[4rem] text-right font-mono text-lg text-zinc-600">
          -
        </span>
        <span className="h-5 w-px bg-zinc-800" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-zinc-500">
            {result?.title ?? "로딩 중..."}
          </span>
          <span className="block truncate text-xs text-zinc-600">
            {result?.artist ?? ""}
          </span>
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className="flex w-full items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5 text-left transition hover:border-zinc-600 hover:bg-zinc-800/60 active:bg-zinc-800/80"
    >
      <span className="min-w-[4rem] text-right font-mono text-lg font-bold text-indigo-400">
        {copied ? (
          <span className="text-sm text-green-400">복사됨</span>
        ) : (
          match.no
        )}
      </span>
      <span className="h-5 w-px bg-zinc-700" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-zinc-200">
          {result!.title}
        </span>
        <span className="block truncate text-xs text-zinc-400">
          {result!.artist}
        </span>
      </span>
    </button>
  );
}
