const DEEPL_API = "https://api-free.deepl.com/v2/translate";

/** Translate Japanese texts to Korean via DeepL Free API */
export async function translateToKorean(
  texts: string[],
  apiKey: string,
): Promise<string[]> {
  if (texts.length === 0 || !apiKey) return texts;

  try {
    const res = await fetch(DEEPL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: texts,
        source_lang: "JA",
        target_lang: "KO",
      }),
    });

    if (!res.ok) return texts;

    const data = await res.json<{
      translations: { text: string }[];
    }>();

    return data.translations.map((t) => t.text);
  } catch {
    return texts;
  }
}
