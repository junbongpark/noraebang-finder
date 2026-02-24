import { KaraokeMatch } from "./types";
import { matchDirect } from "./direct-search";

/** Ensure title_ko column exists (safe to call multiple times) */
export async function ensureTitleKoColumn(db: D1Database): Promise<void> {
  try {
    await db.exec(
      "ALTER TABLE tj_songs ADD COLUMN title_ko TEXT",
    );
  } catch {
    // Column already exists — ignore
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

/** Search TJ songs with title_ko included (for search endpoint) */
export async function searchTJSongs(
  db: D1Database,
  query: string,
  limit: number = 20,
): Promise<{ no: string; title: string; titleKo: string | null; singer: string }[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT no, title, title_ko as titleKo, singer FROM tj_songs
         WHERE title LIKE ? OR title_ko LIKE ?
         LIMIT ?`,
      )
      .bind(`%${query}%`, `%${query}%`, limit)
      .all<{ no: string; title: string; titleKo: string | null; singer: string }>();
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
