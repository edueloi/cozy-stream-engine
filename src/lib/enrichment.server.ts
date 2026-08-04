// Server-only: enriquece um prospecting_result usando Apify, Google Maps, Google Search,
// LinkedIn e Instagram. Não altera os fluxos existentes — apenas reutiliza os wrappers.

import { detectTech } from "@/lib/tech-detect.server";

export interface EnrichableResult {
  id: string;
  organization_id: string;
  company_name: string;
  cnpj: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  google_maps_url: string | null;
  city: string | null;
  state: string | null;
  enrichment_status: string | null;
  enriched_at: string | null;
}

export interface EnrichOutcome {
  patch: Record<string, any>;
  sources_used: string[];
  errors: string[];
  cost_cents: number;
  status: "completed" | "partial" | "failed";
}

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export function isFreshlyEnriched(r: EnrichableResult): boolean {
  if (r.enrichment_status !== "completed" || !r.enriched_at) return false;
  return Date.now() - new Date(r.enriched_at).getTime() < RECENT_MS;
}

async function googleSearchFirst(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0 SDR-JCS-Bot" } },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/uddg=([^&"']+)/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function extractSocial(html: string, host: RegExp): string | null {
  const m = html.match(new RegExp(`https?://[^"'\\s>]*${host.source}[^"'\\s>]*`, "i"));
  return m ? m[0] : null;
}

export async function enrichCompany(
  r: EnrichableResult,
  opts: { apifyToken?: string | null; force?: boolean } = {},
): Promise<EnrichOutcome> {
  const patch: Record<string, any> = {};
  const sources: string[] = [];
  const errors: string[] = [];
  let cost = 0;

  // 1. site
  let site = r.website;
  if (!site) {
    const q = `${r.company_name} ${r.city ?? ""} site oficial`;
    const found = await googleSearchFirst(q);
    if (found) {
      site = found;
      patch.website = site;
      sources.push("google_search");
    }
  }

  // 2. site scrape → email, redes sociais, tech
  let siteHtml = "";
  if (site) {
    try {
      const enrich = await detectTech(site);
      if (enrich.technologies.length) patch.technologies = enrich.technologies;
      if (enrich.meta && (enrich.meta as any).email && !r.email) {
        patch.email = (enrich.meta as any).email;
      }
      patch.enrichment = enrich.meta;
      sources.push("website_scrape");
      // reler para redes sociais
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(site.startsWith("http") ? site : `https://${site}`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 SDR-JCS-Bot" },
      }).finally(() => clearTimeout(t));
      if (res.ok) siteHtml = await res.text();
    } catch (e) {
      errors.push(`site: ${(e as Error).message}`);
    }
  }

  if (siteHtml) {
    if (!r.linkedin_url) {
      const li = extractSocial(siteHtml, /linkedin\.com\/(company|in)\//);
      if (li) {
        patch.linkedin_url = li;
        sources.push("linkedin");
      }
    }
    if (!r.instagram_url) {
      const ig = extractSocial(siteHtml, /instagram\.com\//);
      if (ig) {
        patch.instagram_url = ig;
        sources.push("instagram");
      }
    }
    if (!patch.email && !r.email) {
      const em = siteHtml.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (em) patch.email = em[0];
    }
    if (!r.phone) {
      const ph = siteHtml.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
      if (ph) patch.phone = ph[0];
    }
  }

  // 3. Google Maps via Apify (só se token e faltarem dados críticos)
  const needMaps = !r.phone && !patch.phone && !r.google_maps_url;
  if (needMaps && opts.apifyToken) {
    try {
      const { runApifyActor, ACTORS, buildGoogleMapsInput, mapGoogleMapsItem } = await import(
        "@/lib/apify.server"
      );
      const out = await runApifyActor(
        opts.apifyToken,
        ACTORS.googleMaps,
        buildGoogleMapsInput({
          keyword: r.company_name,
          city: r.city ?? undefined,
          state: r.state ?? undefined,
          limit: 1,
        }),
        { timeoutMs: 90_000 },
      );
      const it = out.items[0];
      if (it) {
        const m = mapGoogleMapsItem(it);
        if (m.phone && !r.phone) patch.phone = m.phone;
        if (m.website && !patch.website && !r.website) patch.website = m.website;
        if (m.google_maps_url) patch.google_maps_url = m.google_maps_url;
        sources.push("google_maps");
        cost += 5; // estimativa cents
      }
    } catch (e) {
      errors.push(`google_maps: ${(e as Error).message}`);
    }
  }

  const hasContact = Boolean(
    patch.email || r.email || patch.phone || r.phone || patch.linkedin_url || r.linkedin_url,
  );
  const status: EnrichOutcome["status"] = hasContact
    ? errors.length
      ? "partial"
      : "completed"
    : errors.length
      ? "failed"
      : "partial";

  return { patch, sources_used: sources, errors, cost_cents: cost, status };
}