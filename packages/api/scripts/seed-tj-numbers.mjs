#!/usr/bin/env node
/**
 * TJ database gap-filler via number search.
 * Searches strType=16 (song number, contains match) for digits 0-9
 * to guarantee 100% coverage of all TJ songs.
 *
 * Uses conservative 2s delays to avoid IP bans.
 * Saves progress to a local file for resume capability.
 *
 * Usage: node packages/api/scripts/seed-tj-numbers.mjs
 */

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(__dirname, "..");
const PROGRESS_FILE = join(__dirname, ".seed-progress.json");

const TJ_SEARCH_URL = "https://www.tjmedia.com/song/accompaniment_search";
const DELAY_MS = 2000; // 2 seconds between requests
const CHUNK_SIZE = 100; // D1 insert chunk size

// Search all 10 digits — every song number contains at least one
const SEARCH_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

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
  let match;

  // Number search wraps matched digits in <span class='highlight'>,
  // e.g. <span class="num2">51<span class='highlight'>685</span></span>
  // We match the outer num2 span and strip inner HTML to get the full number
  const numRe = /class="num2">([\s\S]*?)<\/span>\s*<\/p>/g;
  const nums = [];
  while ((match = numRe.exec(html)) !== null) {
    const num = stripHtml(match[1]).replace(/\D/g, "");
    if (num) nums.push(num);
  }

  const titleRe = /class="grid-item title3[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  const titles = [];
  while ((match = titleRe.exec(html)) !== null) titles.push(stripHtml(match[1]));

  const singerRe = /class="grid-item title4[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/g;
  const singers = [];
  while ((match = singerRe.exec(html)) !== null) singers.push(stripHtml(match[1]));

  for (let i = 0; i < nums.length && i < titles.length && i < singers.length; i++) {
    results.push({ no: nums[i], title: titles[i], singer: singers[i] });
  }
  return results;
}

function escapeSQL(s) {
  return s.replace(/'/g, "''");
}

function flushToD1(songs) {
  if (songs.length === 0) return;

  let inserted = 0;
  for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
    const chunk = songs.slice(i, i + CHUNK_SIZE);
    const values = chunk
      .map((s) => `('${escapeSQL(s.no)}','${escapeSQL(s.title)}','${escapeSQL(s.singer)}')`)
      .join(",");
    const sql = `INSERT OR IGNORE INTO tj_songs(no,title,singer) VALUES ${values};`;

    const tmpFile = join(API_DIR, `.tmp-seed-num-${i}.sql`);
    writeFileSync(tmpFile, sql);

    try {
      execSync(`npx wrangler d1 execute tj-songs --remote --file="${tmpFile}" --yes`, {
        cwd: API_DIR,
        stdio: "pipe",
        timeout: 30000,
      });
      inserted += chunk.length;
    } catch (e) {
      console.error(`  D1 insert failed for chunk ${i}-${i + chunk.length}: ${e.message?.slice(0, 120)}`);
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }
  return inserted;
}

function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch {}
  return { digitIndex: 0, pageNo: 1 };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
}

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const progress = loadProgress();
  let totalNew = 0;
  let totalPages = 0;
  const seenNos = new Set();
  const pendingSongs = [];

  console.log(`Starting TJ number crawl — digits 0-9 with ${DELAY_MS}ms delay`);
  console.log(`Resuming from digit[${progress.digitIndex}]="${SEARCH_DIGITS[progress.digitIndex] ?? "done"}", page ${progress.pageNo}`);

  // Get current count
  try {
    const output = execSync(
      `npx wrangler d1 execute tj-songs --remote --command "SELECT COUNT(*) as cnt FROM tj_songs" --json`,
      { cwd: API_DIR, stdio: "pipe", timeout: 15000 }
    ).toString();
    const parsed = JSON.parse(output);
    console.log(`Current D1 count: ${parsed[0]?.results?.[0]?.cnt ?? "unknown"}\n`);
  } catch {}

  for (let di = progress.digitIndex; di < SEARCH_DIGITS.length; di++) {
    const digit = SEARCH_DIGITS[di];
    let pageNo = di === progress.digitIndex ? progress.pageNo : 1;
    let digitResults = 0;

    while (true) {
      const url = `${TJ_SEARCH_URL}?strType=16&searchTxt=${digit}&pageRowCnt=100&pageNo=${pageNo}`;

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; NoraebangFinder/1.0)" },
        });

        if (!res.ok) {
          console.error(`  HTTP ${res.status} for digit "${digit}" page ${pageNo}, skipping`);
          break;
        }

        const html = await res.text();
        const results = parseTJResults(html);

        // Dedup within this run
        const newSongs = results.filter((r) => {
          if (seenNos.has(r.no)) return false;
          seenNos.add(r.no);
          return true;
        });

        pendingSongs.push(...newSongs);
        digitResults += results.length;
        totalPages++;

        // Flush every 500 songs
        if (pendingSongs.length >= 500) {
          console.log(`  Flushing ${pendingSongs.length} songs to D1...`);
          const inserted = flushToD1(pendingSongs);
          totalNew += inserted;
          pendingSongs.length = 0;
        }

        // Save progress
        saveProgress({ digitIndex: di, pageNo: pageNo + 1 });

        if (results.length < 100) {
          // Last page for this digit
          break;
        }

        pageNo++;
        await delay(DELAY_MS);
      } catch (e) {
        console.error(`  Error on digit "${digit}" page ${pageNo}: ${e.message}`);
        // Save progress and retry next run
        saveProgress({ digitIndex: di, pageNo });
        // Try to continue after a longer pause
        await delay(DELAY_MS * 3);
        break;
      }
    }

    console.log(
      `[${di + 1}/${SEARCH_DIGITS.length}] digit "${digit}" — ${digitResults} results fetched, ${seenNos.size} unique seen`
    );

    await delay(DELAY_MS);
  }

  // Final flush
  if (pendingSongs.length > 0) {
    console.log(`  Final flush: ${pendingSongs.length} songs to D1...`);
    flushToD1(pendingSongs);
  }

  // Clean up progress file
  try { unlinkSync(PROGRESS_FILE); } catch {}

  console.log(`\nDone! Crawled ${totalPages} pages, found ${seenNos.size} unique songs.`);

  // Final count
  try {
    const output = execSync(
      `npx wrangler d1 execute tj-songs --remote --command "SELECT COUNT(*) as cnt FROM tj_songs" --json`,
      { cwd: API_DIR, stdio: "pipe", timeout: 15000 }
    ).toString();
    const parsed = JSON.parse(output);
    console.log(`Final D1 count: ${parsed[0]?.results?.[0]?.cnt ?? "unknown"}`);
  } catch {}
}

main().catch(console.error);
