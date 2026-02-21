import { useState } from "react";
import { KaraokeResult } from "../types";

interface Props {
  results: KaraokeResult[];
  playlistName: string;
}

function toCSV(results: KaraokeResult[]): string {
  const header = "Track,Artist,TJ,KY,Joysound";
  const rows = results.map((r) => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
      escape(r.title),
      escape(r.artist),
      r.tj?.no || "",
      r.ky?.no || "",
      r.joysound?.no || "",
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function toClipboardText(results: KaraokeResult[]): string {
  return results
    .map(
      (r) =>
        `${r.title}\t${r.artist}\t${r.tj?.no || "-"}\t${r.ky?.no || "-"}\t${r.joysound?.no || "-"}`,
    )
    .join("\n");
}

export default function ExportButton({ results, playlistName }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toClipboardText(results));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const csv = toCSV(results);
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlistName}-numbers.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleCopy}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
      >
        {copied ? "Copied!" : "Copy to Clipboard"}
      </button>
      <button
        onClick={handleDownload}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
      >
        Download CSV
      </button>
    </div>
  );
}
