# 노래방 번호 찾기 (Noraebang Finder)

플레이리스트 링크로 TJ/금영/Joysound 노래방 번호를 한번에 찾아주는 앱.

## Architecture

Monorepo with two packages:

- **`packages/api`** — Cloudflare Workers + Hono API
  - Playlist extraction (Spotify embed scraping, YouTube Music InnerTube, Apple Music HTML scraping — no API keys needed)
  - Karaoke number lookup via [Manana API](https://api.manana.kr) + D1 database + TJ direct search fallback
  - **D1 database**: 70K+ TJ songs for fast, persistent lookup (Manana gaps filled)
  - SSE streaming endpoint for real-time results
  - KV caching with 7-day TTL
  - Cron-based popular artist precaching + TJ crawler
  - J-pop new releases via Mastodon bot (`@karaoke_jpop@planet.moe`) + Manana fallback
  - DeepL Free API for JA→KO title translation (cron batch + new release instant)

- **`packages/web`** — Vite + React 19 + Tailwind CSS 4
  - Mobile-first dark theme UI (Korean)
  - SSE stream consumption with throttled rendering
  - Progressive result display with skeleton loading

## Development

```bash
# API (Cloudflare Workers)
cd packages/api
wrangler dev                    # localhost:8787

# Web (Vite dev server with proxy)
cd packages/web
npm run dev                     # localhost:5173, proxies /api → :8787
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/api/src/index.ts` | Hono routes + scheduled handler |
| `packages/api/src/lib/karaoke.ts` | Core matching logic, SSE streaming, caching |
| `packages/api/src/lib/matching.ts` | Levenshtein similarity scoring |
| `packages/api/src/lib/spotify.ts` | Spotify embed scraping (no API key needed) |
| `packages/api/src/lib/youtube-music.ts` | YouTube Music InnerTube scraping (no API key needed) |
| `packages/api/src/lib/apple-music.ts` | Apple Music HTML scraping (no API key needed) |
| `packages/api/src/lib/tj-db.ts` | D1 database search/save for TJ songs |
| `packages/api/src/lib/tj-crawler.ts` | Cron-based TJ website crawler for D1 population |
| `packages/api/src/lib/direct-search.ts` | TJ direct website search fallback |
| `packages/api/src/lib/url-parser.ts` | Playlist URL parsing and platform detection |
| `packages/api/src/lib/mastodon-releases.ts` | Mastodon bot J-pop release sync |
| `packages/api/src/lib/jpop-filter.ts` | J-pop song detection (hiragana/katakana + known artists) |
| `packages/api/src/lib/deepl.ts` | DeepL Free API client (JA→KO translation) |
| `packages/web/src/components/SearchBar.tsx` | TJ song search with Korean translation |
| `packages/web/src/hooks/usePlaylistConvert.ts` | SSE stream consumption hook |
| `packages/web/src/components/TrackRow.tsx` | Karaoke number cards (mobile-first) |

## Conventions

- All user-facing text in Korean
- Dark mode only (bg-zinc-900 base)
- Tailwind CSS 4 (v4 plugin, no config file)
- TypeScript strict mode
- Hono framework for API routes

## API Endpoints

- `POST /api/playlist` — Extract tracks from Spotify/YouTube Music/Apple Music playlist URL
- `POST /api/karaoke` — Batch lookup (returns all at once)
- `POST /api/karaoke/stream` — SSE streaming lookup (results one by one)
- `GET /api/releases/recent` — This week's new J-pop releases (Mastodon bot primary, Manana fallback)
- `GET /api/search?q=` — Search TJ songs by title or Korean translation

## Caching Strategy

1. **TJ D1 database** — 70K+ songs, persistent SQLite via Cloudflare D1, daily cron crawler
2. **Popular artists** — Precached daily via cron (Jpop/Kpop/Western)
3. **User queries** — Auto-cached in KV on first lookup (7-day TTL)
4. **New releases** — Monthly release data fetched via cron → artist catalogs cached

## Deployment

- **API**: `cd packages/api && wrangler deploy`
- **Web**: Auto-deployed to GitHub Pages on push to main
- **No API keys needed** — all platform integrations use public scraping
- **GitHub repo variable**: `VITE_API_URL` (Workers production URL)

## DeepL Translation (미설정)

J-pop 곡명을 한국어로 자동 번역하는 기능. 현재 API 키 미설정 상태.

### 설정 방법
1. [DeepL](https://www.deepl.com/your-account/keys)에서 Free 플랜 가입 후 API 키 발급
2. `cd packages/api && npx wrangler secret put DEEPL_API_KEY` 실행 후 키 입력
3. cron이 돌면 자동으로 번역 시작 (일 50곡 배치 + 신곡 즉시 번역)

### 사용량
- Free 플랜: 월 50만자
- 예상 사용량: 시드 72곡 ~2,000자 + 일 50곡 ~1,500자 → 월 ~5만자 (한도의 10%)
- `title_ko` 컬럼에 저장, 검색 및 신곡 표시에 활용
