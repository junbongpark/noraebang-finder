#!/usr/bin/env node
/**
 * One-time TJ database seeder.
 * Crawls TJ Media website systematically and inserts into remote D1 via wrangler.
 *
 * Usage: node packages/api/scripts/seed-tj.mjs
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, "..");

const TJ_SEARCH_URL = "https://www.tjmedia.com/song/accompaniment_search";
const DELAY_MS = 500;
const FLUSH_THRESHOLD = 500; // Flush to D1 after accumulating this many songs

// Characters to crawl
const CRAWL_CHARS = [
  // Korean initial syllables
  "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
  // Japanese hiragana
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ",
  // English
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  // Digits
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
];

function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function parseTJResults(html) {
  const results = [];
  // Primary regex
  const blockRe =
    /<li[^>]*class="grid-item num2"[^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>[\s\S]*?<li[^>]*class="grid-item title3"[^>]*>[\s\S]*?<p><span>([\s\S]*?)<\/span><\/p>[\s\S]*?<li[^>]*class="grid-item title4[^"]*"[^>]*>[\s\S]*?<p><span>([\s\S]*?)<\/span><\/p>/g;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    results.push({
      no: match[1],
      title: stripHtml(match[2]),
      singer: stripHtml(match[3]),
    });
  }
  if (results.length > 0) return results;

  // Fallback regex
  const numRe = /<span class="num2">(\d+)<\/span>/g;
  const nums = [];
  while ((match = numRe.exec(html)) !== null) nums.push(match[1]);

  const titleRe =
    /class="grid-item title3[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  const titles = [];
  while ((match = titleRe.exec(html)) !== null) titles.push(stripHtml(match[1]));

  const singerRe =
    /class="grid-item title4[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  const singers = [];
  while ((match = singerRe.exec(html)) !== null)
    singers.push(stripHtml(match[1]));

  for (
    let i = 0;
    i < nums.length && i < titles.length && i < singers.length;
    i++
  ) {
    results.push({ no: nums[i], title: titles[i], singer: singers[i] });
  }
  return results;
}

function escapeSQL(s) {
  return s.replace(/'/g, "''");
}

const CHUNK_SIZE = 100;

function flushToD1(songs) {
  if (songs.length === 0) return;

  // Split into chunks to avoid D1 SQL size limits
  for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
    const chunk = songs.slice(i, i + CHUNK_SIZE);
    const values = chunk
      .map((s) => `('${escapeSQL(s.no)}','${escapeSQL(s.title)}','${escapeSQL(s.singer)}')`)
      .join(",");
    const sql = `INSERT OR IGNORE INTO tj_songs(no,title,singer) VALUES ${values};`;

    const tmpFile = join(API_DIR, `.tmp-seed-${i}.sql`);
    writeFileSync(tmpFile, sql);

    try {
      execSync(`npx wrangler d1 execute tj-songs --remote --file="${tmpFile}" --yes`, {
        cwd: API_DIR,
        stdio: "pipe",
        timeout: 30000,
      });
    } catch (e) {
      console.error(`  D1 insert failed for chunk ${i}-${i + chunk.length}: ${e.message?.slice(0, 100)}`);
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const allSongs = new Map(); // dedup by song number
  let totalPages = 0;

  console.log(`Starting TJ crawl — ${CRAWL_CHARS.length} characters to process`);

  for (let ci = 0; ci < CRAWL_CHARS.length; ci++) {
    const char = CRAWL_CHARS[ci];
    let pageNo = 1;
    let charSongs = 0;

    while (true) {
      const url = `${TJ_SEARCH_URL}?strType=1&searchTxt=${encodeURIComponent(char)}&pageRowCnt=100&pageNo=${pageNo}`;

      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NoraebangFinder/1.0)",
          },
        });

        if (!res.ok) {
          console.error(`  HTTP ${res.status} for "${char}" page ${pageNo}`);
          break;
        }

        const html = await res.text();
        const results = parseTJResults(html);

        for (const r of results) {
          if (!allSongs.has(r.no)) {
            allSongs.set(r.no, r);
          }
        }

        charSongs += results.length;
        totalPages++;

        if (results.length < 100) {
          // Last page
          break;
        }

        pageNo++;
        await delay(DELAY_MS);
      } catch (e) {
        console.error(`  Error crawling "${char}" page ${pageNo}: ${e.message}`);
        break;
      }
    }

    console.log(
      `[${ci + 1}/${CRAWL_CHARS.length}] "${char}" — ${charSongs} results, ${allSongs.size} unique total`
    );

    // Flush to D1 periodically
    if (allSongs.size >= FLUSH_THRESHOLD) {
      const batch = [...allSongs.values()];
      allSongs.clear();
      console.log(`  Flushing ${batch.length} songs to D1...`);
      flushToD1(batch);
    }

    await delay(DELAY_MS);
  }

  // Final flush
  if (allSongs.size > 0) {
    const batch = [...allSongs.values()];
    console.log(`  Final flush: ${batch.length} songs to D1...`);
    flushToD1(batch);
  }

  console.log(`\nDone! Crawled ${totalPages} pages total.`);

  // Check final count
  try {
    const output = execSync(
      `npx wrangler d1 execute tj-songs --remote --command "SELECT COUNT(*) as cnt FROM tj_songs" --json`,
      { cwd: API_DIR, stdio: "pipe", timeout: 15000 }
    ).toString();
    console.log(`D1 row count:`, output.trim());
  } catch {}
}

main().catch(console.error);
