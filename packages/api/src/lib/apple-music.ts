import { PlaylistTrack } from "./types";

interface AppleMusicItem {
  title?: string;
  artistName?: string;
}

export async function getAppleMusicPlaylist(
  url: string,
): Promise<{ name: string; tracks: PlaylistTrack[] }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NoraebangFinder/1.0)",
    },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Playlist not found.");
    throw new Error(`Apple Music error: ${res.status}`);
  }

  const html = await res.text();

  // Extract tracks from serialized server data
  const appMatch = html.match(
    /<script[^>]+id="serialized-server-data"[^>]*>(.*?)<\/script>/s,
  );
  if (!appMatch) {
    throw new Error("Could not parse Apple Music playlist data.");
  }

  const appData = JSON.parse(appMatch[1]);
  const sections = appData?.data?.[0]?.data?.sections;
  if (!Array.isArray(sections)) {
    throw new Error("Could not find track sections in Apple Music data.");
  }

  // Get playlist name from first section (metadata section)
  let name = "Apple Music Playlist";
  if (sections[0]?.items?.[0]?.title) {
    name = sections[0].items[0].title;
  }

  // Find the section containing track items (has trackNumber key)
  let items: AppleMusicItem[] = [];
  for (const section of sections) {
    if (
      Array.isArray(section.items) &&
      section.items.length > 1 &&
      "trackNumber" in section.items[0]
    ) {
      items = section.items;
      break;
    }
  }

  if (items.length === 0) {
    throw new Error("No tracks found in Apple Music playlist.");
  }

  const tracks: PlaylistTrack[] = items
    .filter((item) => item.title)
    .map((item) => ({
      originalTitle: item.title!,
      title: item.title!,
      artist: item.artistName ?? "",
    }));

  return { name, tracks };
}
