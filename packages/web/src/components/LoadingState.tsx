interface Props {
  phase: "extracting" | "looking_up";
  trackCount: number;
}

export default function LoadingState({ phase, trackCount }: Props) {
  return (
    <div className="flex w-full flex-col items-center gap-3 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-indigo-600" />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {phase === "extracting"
          ? "Extracting playlist tracks..."
          : `Looking up karaoke numbers... (${trackCount} tracks)`}
      </p>
    </div>
  );
}
