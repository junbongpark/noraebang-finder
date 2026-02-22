import { KaraokeMatch } from "./types";
import { matchDirect } from "./direct-search";

/** Search TJ songs from D1 database */
export async function searchTJFromDB(
  db: D1Database,
  title: string,
  artist: string,
): Promise<KaraokeMatch | null> {
  const query = title.trim();
  if (!query) return null;

  try {
    const { results } = await db
      .prepare("SELECT no, title, singer FROM tj_songs WHERE title LIKE ?")
      .bind(`%${query}%`)
      .all<{ no: string; title: string; singer: string }>();

    if (!results || results.length === 0) return null;

    return matchDirect(title, artist, results);
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
