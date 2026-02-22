interface Props {
  phase: "extracting" | "streaming";
  trackCount: number;
  progress?: { completed: number; total: number };
}

export default function LoadingState({ phase, trackCount, progress }: Props) {
  if (phase === "extracting") {
    return (
      <div className="flex w-full flex-col items-center gap-3 py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-indigo-500" />
        <p className="text-sm text-zinc-400">
          플레이리스트 가져오는 중...
        </p>
      </div>
    );
  }

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="flex w-full flex-col items-center gap-3 py-6">
      <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-zinc-700">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-zinc-400">
        노래방 번호 검색 중... {progress?.completed ?? 0}/
        {progress?.total ?? trackCount}
      </p>
    </div>
  );
}
