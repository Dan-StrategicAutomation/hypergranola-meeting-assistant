/**
 * Research service - provides lightweight DuckDuckGo helpers:
 * - openDuckDuckGo(query): opens the query in the user's browser/tauri opener
 * - instantAnswer(query): fetches the DuckDuckGo Instant Answer JSON for a concise snippet
 */

export async function instantAnswer(query: string): Promise<{heading?: string; abstract?: string; url?: string} | null> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    // Prefer AbstractText or Heading
    const heading = data.Heading || undefined;
    const abstract = data.AbstractText || data.Abstract || undefined;
    const redirect = data.Redirect || undefined;

    // If redirect is not provided, try to extract FirstURL from RelatedTopics
    let firstUrl: string | undefined = redirect;
    if (!firstUrl && Array.isArray(data.RelatedTopics) && data.RelatedTopics.length > 0) {
      const first = data.RelatedTopics[0];
      if (first && first.FirstURL) firstUrl = first.FirstURL;
      else if (first && first.Topics && first.Topics[0] && first.Topics[0].FirstURL) firstUrl = first.Topics[0].FirstURL;
    }

    return {
      heading,
      abstract,
      url: firstUrl
    };
  } catch (err) {
    console.error('instantAnswer error', err);
    return null;
  }
}

export function openDuckDuckGo(query: string): void {
  const q = encodeURIComponent(query);
  const url = `https://duckduckgo.com/?q=${q}`;
  try {
    // Try Tauri opener if available
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof window !== 'undefined' && (window as any).__TAURI__ && (window as any).__TAURI__.invoke) {
      // In Tauri we can use the shell opener plugin, but to avoid adding deps we'll open a new window
      window.open(url, '_blank');
    } else {
      window.open(url, '_blank');
    }
  } catch (err) {
    console.error('Failed to open DuckDuckGo', err);
  }
}

export default { instantAnswer, openDuckDuckGo };
