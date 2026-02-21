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
      pasted.includes("youtube.com/playlist") ||
      pasted.includes("music.youtube.com/playlist")
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
          placeholder="Paste Spotify or YouTube playlist link..."
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-800"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Processing..." : "Convert"}
        </button>
      </div>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Supports Spotify and YouTube Music playlists
      </p>
    </form>
  );
}
