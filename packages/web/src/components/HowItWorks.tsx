export default function HowItWorks() {
  return (
    <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-800/30 px-4 py-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-0">
        {/* Step 1 */}
        <div className="flex flex-1 flex-col items-center text-center">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900/40 text-sm font-bold text-indigo-400">
            1
          </span>
          <p className="text-sm font-medium text-zinc-200">
            플레이리스트 링크 복사
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Spotify / YT Music / Apple
          </p>
        </div>

        {/* Arrow */}
        <span className="hidden text-zinc-600 sm:block">&rarr;</span>
        <span className="text-zinc-600 sm:hidden">&darr;</span>

        {/* Step 2 */}
        <div className="flex flex-1 flex-col items-center text-center">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900/40 text-sm font-bold text-indigo-400">
            2
          </span>
          <p className="text-sm font-medium text-zinc-200">
            여기에 붙여넣기
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            자동으로 검색 시작
          </p>
        </div>

        {/* Arrow */}
        <span className="hidden text-zinc-600 sm:block">&rarr;</span>
        <span className="text-zinc-600 sm:hidden">&darr;</span>

        {/* Step 3 */}
        <div className="flex flex-1 flex-col items-center text-center">
          <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900/40 text-sm font-bold text-indigo-400">
            3
          </span>
          <p className="text-sm font-medium text-zinc-200">
            번호 확인!
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            TJ / 금영 / Joysound
          </p>
        </div>
      </div>
    </div>
  );
}
