// Server-only Apify wrapper. Never import from client/route files at module
// scope. Credenciais e URL base são passadas pelo caller (resolvidas via
// `getProviderRuntimeConfig`). Este módulo NUNCA lê `process.env` direto.
const DEFAULT_APIFY_BASE = "https://api.apify.com/v2";

export type ApifyRunInput = Record<string, unknown>;

export async function runApifyActor(
  token: string,
  actorId: string,
  input: ApifyRunInput,
  opts: { timeoutMs?: number; pollMs?: number; baseUrl?: string | null } = {},
): Promise<{ runId: string; items: any[] }> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollMs = opts.pollMs ?? 3000;
  const APIFY_BASE = (opts.baseUrl && opts.baseUrl.trim()) || DEFAULT_APIFY_BASE;

  // Trigger run
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new Error(`Apify start failed (${startRes.status}): ${t}`);
  }
  const startJson = (await startRes.json()) as { data: { id: string; defaultDatasetId: string } };
  const runId = startJson.data.id;
  const datasetId = startJson.data.defaultDatasetId;

  // Poll status
  const deadline = Date.now() + timeoutMs;
  let status = "READY";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    const r = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
    if (!r.ok) continue;
    const j = (await r.json()) as { data: { status: string } };
    status = j.data.status;
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
  }
  if (status !== "SUCCEEDED") {
    return { runId, items: [] };
  }

  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`,
  );
  if (!itemsRes.ok) return { runId, items: [] };
  const items = (await itemsRes.json()) as any[];
  return { runId, items: Array.isArray(items) ? items : [] };
}

// Actor IDs (defaults — overridable per call)
export const ACTORS = {
  googleMaps: "compass/crawler-google-places",
  linkedinCompanies: "bebity/linkedin-companies-scraper",
  linkedinPeople: "bebity/linkedin-premium-actor",
  instagram: "apify/instagram-scraper",
};

export function buildGoogleMapsInput(p: {
  keyword: string;
  city?: string;
  state?: string;
  radius_km?: number;
  limit?: number;
}): ApifyRunInput {
  const location = [p.city, p.state, "Brasil"].filter(Boolean).join(", ");
  return {
    searchStringsArray: [p.keyword],
    locationQuery: location,
    maxCrawledPlacesPerSearch: p.limit ?? 100,
    language: "pt-BR",
    countryCode: "br",
    deeperCityScrape: false,
  };
}

export function mapGoogleMapsItem(item: any) {
  return {
    company_name: item.title ?? item.name ?? "",
    phone: item.phone ?? item.phoneUnformatted ?? null,
    website: item.website ?? null,
    address: item.address ?? null,
    city: item.city ?? null,
    state: item.state ?? null,
    category: item.categoryName ?? (Array.isArray(item.categories) ? item.categories[0] : null),
    rating: item.totalScore ?? null,
    reviews_count: item.reviewsCount ?? null,
    google_maps_url: item.url ?? null,
    raw: item,
  };
}

// ---------- LinkedIn Companies ----------
export function buildLinkedinCompaniesInput(p: {
  keyword: string;
  location?: string;
  min_employees?: number;
  limit?: number;
}): ApifyRunInput {
  return {
    queries: [p.keyword],
    keyword: p.keyword,
    location: p.location ?? "Brazil",
    maxItems: p.limit ?? 50,
    minEmployees: p.min_employees ?? undefined,
  };
}

export function mapLinkedinCompanyItem(item: any) {
  const emp =
    item.employeeCount ??
    item.staffCount ??
    item.employees ??
    (typeof item.employeesRange === "string"
      ? parseInt(item.employeesRange.replace(/\D/g, ""), 10)
      : null);
  return {
    company_name: item.name ?? item.companyName ?? item.title ?? "",
    website: item.website ?? item.websiteUrl ?? null,
    phone: item.phone ?? null,
    email: item.email ?? null,
    address: item.headquarters ?? item.address ?? null,
    city: item.city ?? item.locationCity ?? null,
    state: item.state ?? item.locationRegion ?? null,
    category: item.industry ?? item.industries?.[0] ?? null,
    linkedin_url: item.url ?? item.linkedinUrl ?? item.link ?? null,
    estimated_employees: Number.isFinite(emp) ? emp : null,
    bio: item.description ?? item.tagline ?? null,
    followers: item.followerCount ?? item.followers ?? null,
    raw: item,
  };
}

// ---------- Instagram ----------
export function buildInstagramInput(p: {
  keyword: string;
  city?: string;
  limit?: number;
}): ApifyRunInput {
  const term = [p.keyword, p.city].filter(Boolean).join(" ");
  return {
    search: term,
    searchType: "hashtag",
    searchLimit: 1,
    resultsType: "details",
    resultsLimit: p.limit ?? 50,
  };
}

export function mapInstagramItem(item: any) {
  const url =
    item.url ??
    (item.username ? `https://instagram.com/${item.username}` : null);
  return {
    company_name: item.fullName ?? item.username ?? item.ownerFullName ?? "",
    website: item.externalUrl ?? item.website ?? null,
    phone: item.businessPhoneNumber ?? item.phone ?? null,
    email: item.businessEmail ?? item.email ?? null,
    city: null,
    state: null,
    category: item.businessCategoryName ?? item.category ?? null,
    instagram_url: url,
    followers: item.followersCount ?? item.followers ?? null,
    bio: item.biography ?? item.bio ?? null,
    raw: item,
  };
}