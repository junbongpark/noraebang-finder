import { KaraokeMatch } from "./types";
import { matchDirect } from "./direct-search";

/** Ensure title_ko and singer_ko columns exist (safe to call multiple times) */
export async function ensureKoColumns(db: D1Database): Promise<void> {
  try {
    await db.exec("ALTER TABLE tj_songs ADD COLUMN title_ko TEXT");
  } catch {
    // Column already exists
  }
  try {
    await db.exec("ALTER TABLE tj_songs ADD COLUMN singer_ko TEXT");
  } catch {
    // Column already exists
  }
}

/** Japanese artist → Korean transliteration mapping */
const SINGER_KO_MAP: Record<string, string> = {
  "米津玄師": "요네즈 켄시",
  "Official髭男dism": "오피셜 히게단디즘",
  "あいみょん": "아이묭",
  "藤井風": "후지이 카제",
  "優里": "유우리",
  "King Gnu": "킹 누",
  "back number": "백넘버",
  "サカナクション": "사카나쿠션",
  "RADWIMPS": "라드윔프스",
  "Mrs. GREEN APPLE": "미세스 그린 애플",
  "YOASOBI": "요아소비",
  "Ado": "아도",
  "tuki.": "츠키",
  "Vaundy": "바운디",
  "imase": "이마세",
  "Creepy Nuts": "크리피 넛츠",
  "Eve": "이브",
  "LiSA": "리사",
  "Aimer": "에메",
  "milet": "밀레",
  "Reol": "레올",
  "BUMP OF CHICKEN": "범프 오브 치킨",
  "SEKAI NO OWARI": "세카이노 오와리",
  "amazarashi": "아마자라시",
  "ヨルシカ": "요루시카",
  "DUSTCELL": "더스트셀",
  "TUYU": "츠유",
  "yama": "야마",
  "Tani Yuuki": "타니 유우키",
  "sumika": "스미카",
  "ONE OK ROCK": "원오크록",
  "MAN WITH A MISSION": "맨 위드 어 미션",
  "紫今": "시이마",
  "緑黄色社会": "료쿠오쇼쿠 샤카이",
  "スピッツ": "스핏츠",
  "宇多田ヒカル": "우타다 히카루",
  "中島みゆき": "나카지마 미유키",
  "椎名林檎": "시이나 링고",
  "星野源": "호시노 겐",
  "菅田将暉": "스다 마사키",
  "MISIA": "미샤",
  "平井大": "히라이 다이",
  "秦基博": "하타 모토히로",
  "GReeeeN": "그리인",
  "コブクロ": "코부쿠로",
  "嵐": "아라시",
  "Mr.Children": "미스터 칠드런",
  "B'z": "비즈",
  "GLAY": "글레이",
  "L'Arc~en~Ciel": "라르크 앙 시엘",
  "X JAPAN": "엑스 재팬",
};

/** Batch update singer_ko from mapping table */
export async function updateSingerKoBatch(db: D1Database): Promise<void> {
  try {
    const entries = Object.entries(SINGER_KO_MAP);
    const stmt = db.prepare(
      "UPDATE tj_songs SET singer_ko = ? WHERE singer = ? AND singer_ko IS NULL",
    );
    const batch = entries.map(([singer, singerKo]) => stmt.bind(singerKo, singer));
    // D1 batch limit is 100
    for (let i = 0; i < batch.length; i += 100) {
      await db.batch(batch.slice(i, i + 100));
    }
  } catch {
    // Non-critical
  }
}

/** Search TJ songs from D1 database */
export async function searchTJFromDB(
  db: D1Database,
  title: string,
  artist: string,
  artistAliases?: string[],
): Promise<KaraokeMatch | null> {
  const query = title.trim();
  if (!query) return null;

  try {
    const { results } = await db
      .prepare("SELECT no, title, singer FROM tj_songs WHERE title LIKE ?")
      .bind(`%${query}%`)
      .all<{ no: string; title: string; singer: string }>();

    if (!results || results.length === 0) return null;

    return matchDirect(title, artist, results, artistAliases);
  } catch {
    return null;
  }
}

/** Save TJ search results to D1 (batch upsert) */
export async function saveTJResults(
  db: D1Database,
  results: { no: string; title: string; singer: string }[],
): Promise<void> {
  if (results.length === 0) return;

  try {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO tj_songs (no, title, singer) VALUES (?, ?, ?)",
    );
    const batch = results.map((r) => stmt.bind(r.no, r.title, r.singer));
    await db.batch(batch);
  } catch {
    // D1 write failure — non-critical
  }
}

/** Get J-pop songs with Japanese titles that haven't been translated yet */
export async function getUntranslatedJpopSongs(
  db: D1Database,
  limit: number,
): Promise<{ no: string; title: string }[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT no, title FROM tj_songs
         WHERE title_ko IS NULL
         AND (title GLOB '*[ぁ-ん]*' OR title GLOB '*[ァ-ヶ]*')
         LIMIT ?`,
      )
      .bind(limit)
      .all<{ no: string; title: string }>();
    return results ?? [];
  } catch {
    return [];
  }
}

/** Update Korean translation for a batch of songs */
export async function updateTitleKoBatch(
  db: D1Database,
  updates: { no: string; titleKo: string }[],
): Promise<void> {
  if (updates.length === 0) return;
  try {
    const stmt = db.prepare(
      "UPDATE tj_songs SET title_ko = ? WHERE no = ?",
    );
    const batch = updates.map((u) => stmt.bind(u.titleKo, u.no));
    await db.batch(batch);
  } catch {
    // Non-critical
  }
}

/** Search TJ songs with title_ko and singer_ko included (for search endpoint) */
export async function searchTJSongs(
  db: D1Database,
  query: string,
  limit: number = 20,
): Promise<{ no: string; title: string; titleKo: string | null; singer: string; singerKo: string | null }[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT no, title, title_ko as titleKo, singer, singer_ko as singerKo FROM tj_songs
         WHERE title LIKE ? OR title_ko LIKE ? OR singer LIKE ? OR singer_ko LIKE ?
         LIMIT ?`,
      )
      .bind(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit)
      .all<{ no: string; title: string; titleKo: string | null; singer: string; singerKo: string | null }>();
    return results ?? [];
  } catch {
    return [];
  }
}

/** Get title_ko for a specific song number */
export async function getTitleKo(
  db: D1Database,
  no: string,
): Promise<string | null> {
  try {
    const row = await db
      .prepare("SELECT title_ko FROM tj_songs WHERE no = ?")
      .bind(no)
      .first<{ title_ko: string | null }>();
    return row?.title_ko ?? null;
  } catch {
    return null;
  }
}
