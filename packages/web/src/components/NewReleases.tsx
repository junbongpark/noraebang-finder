import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

type Device = "tj" | "ky";

const DEVICE_LABELS: Record<Device, string> = {
  tj: "TJ",
  ky: "금영",
};

interface ReleaseEntry {
  brand: string;
  no: string;
  title: string;
  singer: string;
  release: string;
}

export default function NewReleases() {
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<Device>("tj");

  useEffect(() => {
    fetch(`${API_BASE}/api/releases/recent`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setReleases(data.releases ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = releases.filter((e) =>
    device === "tj" ? e.brand === "tj" : e.brand === "kumyoung",
  );

  if (loading) {
    return (
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-white">
          이번 주 J-pop 신곡
        </h2>
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-zinc-800/40"
            />
          ))}
        </div>
      </div>
    );
  }

  if (releases.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-semibold text-white">
        이번 주 J-pop 신곡
      </h2>

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

      <p className="mb-3 text-sm text-zinc-400">
        {DEVICE_LABELS[device]} {filtered.length}곡
      </p>

      <div className="space-y-1">
        {filtered.map((entry, i) => (
          <ReleaseRow key={`${entry.brand}-${entry.no}-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ReleaseRow({ entry }: { entry: ReleaseEntry }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.no);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      onClick={handleCopy}
      className="flex w-full items-center gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5 text-left transition hover:border-zinc-600 hover:bg-zinc-800/60 active:bg-zinc-800/80"
    >
      <span className="min-w-[4rem] text-right font-mono text-lg font-bold text-indigo-400">
        {copied ? (
          <span className="text-sm text-green-400">복사됨</span>
        ) : (
          entry.no
        )}
      </span>
      <span className="h-5 w-px bg-zinc-700" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-zinc-200">
          {entry.title}
        </span>
        <span className="block truncate text-xs text-zinc-400">
          {entry.singer}
        </span>
      </span>
    </button>
  );
}
