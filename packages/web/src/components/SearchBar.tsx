import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface SearchResult {
  no: string;
  title: string;
  titleKo: string | null;
  singer: string;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q.trim())}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setResults(data.results ?? []);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const handleChange = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  return (
    <div className="relative mt-6" ref={wrapperRef}>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5">
        <svg className="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="TJ 곡 검색 (제목/한국어)"
          className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
        />
        {loading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-400" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-800 shadow-xl">
          <div className="max-h-80 overflow-y-auto">
            {results.map((r) => (
              <ResultRow key={r.no} result={r} onClose={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}

      {open && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-4 py-3 text-center text-sm text-zinc-500 shadow-xl">
          검색 결과가 없습니다
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, onClose }: { result: SearchResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.no);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1000);
    } catch {}
  };

  return (
    <button
      onClick={handleCopy}
      className="flex w-full items-center gap-3 border-b border-zinc-700/30 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-zinc-700/40 active:bg-zinc-700/60"
    >
      <span className="min-w-[4rem] text-right font-mono text-lg font-bold text-indigo-400">
        {copied ? (
          <span className="text-sm text-green-400">복사됨</span>
        ) : (
          result.no
        )}
      </span>
      <span className="h-5 w-px bg-zinc-700" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-zinc-200">
          {result.title}
        </span>
        {result.titleKo && (
          <span className="block truncate text-xs text-zinc-400">
            {result.titleKo}
          </span>
        )}
        <span className="block truncate text-xs text-zinc-500">
          {result.singer}
        </span>
      </span>
    </button>
  );
}
