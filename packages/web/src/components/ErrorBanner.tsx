interface Props {
  message: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
      <p className="text-sm text-red-700 dark:text-red-400">{message}</p>
      <button
        onClick={onDismiss}
        className="ml-4 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
      >
        &times;
      </button>
    </div>
  );
}
