// Heurística simples de detecção de tecnologia a partir do HTML/headers do site.
const SIGNALS: Array<{ key: string; tech: string; rx: RegExp }> = [
  { key: "ms365", tech: "Microsoft 365", rx: /outlook\.office365\.com|sharepoint\.com|onmicrosoft\.com|office\.com/i },
  { key: "gworkspace", tech: "Google Workspace", rx: /google\.com\/a\/|googlemail\.com|workspace\.google\.com|mx.*google/i },
  { key: "cloudflare", tech: "Cloudflare", rx: /cloudflare/i },
  { key: "wordpress", tech: "WordPress", rx: /wp-content|wp-includes|wordpress/i },
  { key: "ga", tech: "Google Analytics", rx: /www\.google-analytics\.com|gtag\(|googletagmanager/i },
  { key: "meta_pixel", tech: "Meta Pixel", rx: /connect\.facebook\.net\/.*fbevents/i },
  { key: "intercom", tech: "Intercom", rx: /intercomcdn|intercom\.io/i },
  { key: "tawk", tech: "Tawk.to", rx: /tawk\.to/i },
  { key: "hubspot", tech: "HubSpot", rx: /hs-scripts|hubspot/i },
  { key: "rdstation", tech: "RD Station", rx: /rdstation/i },
  { key: "shopify", tech: "Shopify", rx: /cdn\.shopify\.com|shopify/i },
  { key: "vtex", tech: "VTEX", rx: /vtexcommercestable|vtex/i },
  { key: "totvs", tech: "TOTVS", rx: /totvs/i },
];

export async function detectTech(url: string): Promise<{ technologies: string[]; meta: Record<string, any> }> {
  if (!url) return { technologies: [], meta: {} };
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(fullUrl, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 SDR-JCS-Bot" },
    }).finally(() => clearTimeout(t));
    if (!res.ok) return { technologies: [], meta: { status: res.status } };
    const html = await res.text();
    const headerStr = JSON.stringify(Object.fromEntries(res.headers));
    const hay = html + "\n" + headerStr;
    const found = new Set<string>();
    for (const s of SIGNALS) if (s.rx.test(hay)) found.add(s.tech);
    // Email mailto
    const emailMatch = html.match(/mailto:([^"'\s>]+)/i);
    return {
      technologies: Array.from(found),
      meta: { email: emailMatch?.[1] ?? null, length: html.length },
    };
  } catch (e) {
    return { technologies: [], meta: { error: (e as Error).message } };
  }
}