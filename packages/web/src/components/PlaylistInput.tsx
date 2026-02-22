import { useState, FormEvent, ClipboardEvent } from "react";

interface Props {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export default function PlaylistInput({ onSubmit, isLoading }: Props) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim() && !isLoading) onSubmit(url.trim());
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (
      pasted.includes("spotify.com/playlist") ||
      pasted.includes("spotify.com/album") ||
      pasted.includes("youtube.com/playlist") ||
      pasted.includes("music.youtube.com/playlist") ||
      pasted.includes("music.apple.com/")
    ) {
      setTimeout(() => onSubmit(pasted.trim()), 100);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={handlePaste}
          placeholder="플레이리스트 링크를 붙여넣으세요"
          className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-4 text-base text-white outline-none transition placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-800"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="rounded-lg bg-indigo-600 px-6 py-4 text-base font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:py-3"
        >
          {isLoading ? "검색 중..." : "검색"}
        </button>
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Spotify, YouTube Music, Apple Music 플레이리스트 지원
      </p>
    </form>
  );
}
