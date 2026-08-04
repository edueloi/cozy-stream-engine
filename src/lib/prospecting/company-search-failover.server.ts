/**
 * Company Search com failover orquestrado.
 *
 * Ponto único de entrada para capability `company_search`.
 * Reutiliza o Provider Registry (failover-registry.server.ts) e o
 * executor de failover (failover-executor.server.ts) da Release 1.3.6.
 *
 * Nenhum provider é chamado diretamente pela UI ou pela server-function
 * de Prospecção. O adapter é escolhido dinamicamente conforme:
 *   provider_credentials.enabled + priority + health score + budget.
 *
 * Ordem padrão (configurável por organização em provider_credentials):
 *   kipflow → casa_dos_dados → apify → custom_api → webhook
 *
 * Erros de usuário (400/422, filtros inválidos) NÃO disparam failover.
 * Erros de provider (401/403/402/429/5xx/timeout/dns/ssl) trocam
 * automaticamente para o próximo candidato elegível.
 */

import { runWithFailover, type FailoverResult } from "@/lib/providers/failover-executor.server";
import type { CandidateProvider } from "@/lib/providers/failover-registry.server";

export interface CompanySearchFilters {
  cnpj?: string | null;
  keyword?: string | null;
  uf?: string | null;
  cidade?: string | null;
  cnae_principal?: string | null;
  cnaes_secundarios?: string | null;
  porte?: string | string[] | null;
  situacao_cadastral?: string | null;
  natureza_juridica?: string | null;
  data_abertura_de?: string | null;
  data_abertura_ate?: string | null;
  capital_social_min?: number | null;
  capital_social_max?: number | null;
  com_email?: boolean | null;
  com_telefone?: boolean | null;
  com_celular?: boolean | null;
  limite?: number | null;
  [k: string]: unknown;
}

/** Linha normalizada minimamente para persistir em prospecting_results. */
export interface CompanyRow {
  company_name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  category: string | null;
  cnae: string | null;
  cnaes_secundarios: string[] | null;
  porte: string | null;
  situacao_cadastral: string | null;
  natureza_juridica: string | null;
  data_abertura: string | null;
  capital_social: number | null;
  discovery_source: string;
  raw: unknown;
}

export interface CompanySearchInput {
  organizationId: string;
  filters: CompanySearchFilters;
  searchId?: string | null;
  preferredProvider?: string | null;
  /** Injetável para testes — substitui o executor de failover. */
  __runWithFailover?: typeof runWithFailover;
  /** Injetável para testes — evita I/O em adapters reais. */
  __execOverride?: (candidate: CandidateProvider) => Promise<CompanyRow[] | null>;
}

export interface CompanySearchOutput {
  ok: boolean;
  provider: string | null;
  rows: CompanyRow[];
  fallbackChain: FailoverResult<CompanyRow[]>["chain"];
  reasonByProvider: Record<string, string>;
  userMessage: string;
}

const FRIENDLY_EXHAUSTED =
  "Não foi possível concluir a busca porque nenhuma fonte de dados está disponível no momento. Tente novamente mais tarde ou peça ao administrador para revisar as integrações.";

const FRIENDLY_EMPTY =
  "Nenhuma empresa encontrada com esses filtros. Tente ampliar a busca (remover cidade, CNAE ou situação cadastral) ou usar um segmento diferente.";

/**
 * Enriquece rows com CNPJ usando Kipflow, preenchendo campos ausentes
 * (email, telefone, website, endereço, redes sociais). Silencioso em erros
 * — nunca falha a busca. Limita concorrência e volume para controlar custo.
 */
export async function enrichRowsWithKipflow(
  rows: CompanyRow[],
  organizationId: string,
  opts: { maxRows?: number } = {},
): Promise<{ rows: CompanyRow[]; enrichedCount: number; attempted: number; errors: number }> {
  const maxRows = Math.max(1, Math.min(50, opts.maxRows ?? 25));
  const { getProviderRuntimeConfig } = await import("@/lib/providers/runtime-config.server");
  const cfg = await getProviderRuntimeConfig({ organizationId, provider: "kipflow" }).catch(() => null);
  if (!cfg?.apiKey) return { rows, enrichedCount: 0, attempted: 0, errors: 0 };

  const { createKipflowAdapter } = await import(
    "@/lib/jcs-data-engine/providers/kipflow.adapter.server"
  );
  const adapter = createKipflowAdapter(organizationId);

  const targets = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => {
      const cnpj = (r.cnpj ?? "").replace(/\D/g, "");
      if (cnpj.length !== 14) return false;
      return !r.email || !r.phone || !r.website || !r.address;
    })
    .slice(0, maxRows);

  let enrichedCount = 0;
  let errors = 0;
  for (const { r, idx } of targets) {
    try {
      const cnpj = (r.cnpj ?? "").replace(/\D/g, "");
      const c = await adapter.companyEnrichment!({ cnpj });
      if (!c) continue;
      const merged = { ...r };
      let changed = false;
      const fill = <K extends keyof CompanyRow>(k: K, v: CompanyRow[K] | null | undefined) => {
        if (merged[k] == null && v != null && v !== "") {
          (merged as any)[k] = v;
          changed = true;
        }
      };
      fill("email", c.email as any);
      fill("phone", c.phone as any);
      fill("website", c.website as any);
      fill("address", c.address as any);
      fill("city", c.city as any);
      fill("state", c.state as any);
      fill("segment", c.segment as any);
      fill("capital_social", (c as any).capital ?? null);
      if (changed) {
        rows[idx] = merged;
        enrichedCount++;
      }
    } catch {
      errors++;
    }
  }
  return { rows, enrichedCount, attempted: targets.length, errors };
}

function isBroadFilterSearch(f: CompanySearchFilters): boolean {
  return !f.cnpj;
}

/** Executa a busca usando o failover orquestrado. */
export async function executeCompanySearchWithFailover(
  input: CompanySearchInput,
): Promise<CompanySearchOutput> {
  const exec =
    input.__execOverride ??
    (async (candidate: CandidateProvider): Promise<CompanyRow[] | null> => {
      const p = candidate.provider;
      const f = input.filters;

      if (p === "kipflow") {
        // Adapter Kipflow atual só pesquisa por CNPJ. Buscas amplas por
        // filtros disparam unsupported_capability para pular sem erro fatal.
        if (isBroadFilterSearch(f)) {
          const err: any = new Error("unsupported_capability: kipflow requires cnpj");
          err.category = "unsupported_capability";
          throw err;
        }
        const { KipflowAdapter } = await import(
          "@/lib/jcs-data-engine/providers/kipflow.adapter.server"
        );
        const list = await KipflowAdapter.companySearch!({ cnpj: String(f.cnpj) });
        return (list ?? []).map((c: any) => ({
          company_name: c.company_name ?? c.legal_name ?? c.cnpj ?? "",
          cnpj: (c.cnpj ?? "").replace(/\D/g, "") || null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          website: c.website ?? null,
          address: c.address ?? null,
          city: c.city ?? null,
          state: c.state ?? null,
          segment: c.segment ?? null,
          category: c.segment ?? null,
          cnae: null,
          cnaes_secundarios: null,
          porte: null,
          situacao_cadastral: null,
          natureza_juridica: null,
          data_abertura: null,
          capital_social: c.capital ?? null,
          discovery_source: "kipflow",
          raw: c.raw ?? c,
        }));
      }

      if (p === "casa_dos_dados") {
        const { searchCasaDosDados } = await import("@/lib/casa-dos-dados.server");
        const rows = await searchCasaDosDados(candidate.config.apiKey ?? undefined, f as any, {
          baseUrl: candidate.config.baseUrl,
        });
        return (rows ?? []).map((c) => ({
          company_name: c.razao_social || c.nome_fantasia || c.cnpj,
          cnpj: c.cnpj || null,
          phone: c.telefone,
          email: c.email,
          website: c.site,
          address: c.endereco,
          city: c.cidade,
          state: c.uf,
          segment: c.cnae_principal,
          category: c.cnae_principal,
          cnae: c.cnae_principal,
          cnaes_secundarios: c.cnaes_secundarios,
          porte: c.porte,
          situacao_cadastral: c.situacao_cadastral,
          natureza_juridica: c.natureza_juridica,
          data_abertura: c.data_abertura,
          capital_social: c.capital_social,
          discovery_source: "casa_dos_dados",
          raw: c.raw,
        }));
      }

      if (p === "apify") {
        const token = candidate.config.apiKey;
        if (!token) {
          const err: any = new Error("no_credential");
          err.category = "invalid_credentials";
          throw err;
        }
        const { runApifyActor, ACTORS, buildGoogleMapsInput, mapGoogleMapsItem } = await import(
          "@/lib/apify.server"
        );
        const keyword =
          (typeof (f as any).segmento === "string" && (f as any).segmento.trim()) ||
          (f.keyword && String(f.keyword).trim()) ||
          (f.cnae_principal ? `CNAE ${String(f.cnae_principal)}` : "") ||
          "empresas";
        const out = await runApifyActor(
          token,
          ACTORS.googleMaps,
          buildGoogleMapsInput({
            keyword,
            city: f.cidade ?? undefined,
            state: f.uf ?? undefined,
            limit: Math.max(1, Math.min(1000, Number(f.limite ?? 100))),
          }),
          { timeoutMs: 180_000, baseUrl: candidate.config.baseUrl },
        );
        return out.items.map(mapGoogleMapsItem).map((it: any) => ({
          company_name: it.company_name,
          cnpj: null,
          phone: it.phone ?? null,
          email: it.email ?? null,
          website: it.website ?? null,
          address: it.address ?? null,
          city: it.city ?? null,
          state: it.state ?? null,
          segment: it.category ?? null,
          category: it.category ?? null,
          cnae: null,
          cnaes_secundarios: null,
          porte: null,
          situacao_cadastral: null,
          natureza_juridica: null,
          data_abertura: null,
          capital_social: null,
          discovery_source: "apify",
          raw: it.raw ?? it,
        }));
      }

      // custom_api / webhook: sem implementação nesta release — pula.
      const err: any = new Error(`unsupported_capability: ${p} company_search not implemented`);
      err.category = "unsupported_capability";
      throw err;
    });

  const run = input.__runWithFailover ?? runWithFailover;
  const result = await run<CompanyRow[]>({
    organizationId: input.organizationId,
    capability: "company_search",
    operation: "company_search",
    mode: input.preferredProvider ? "manual" : "auto",
    pinned: input.preferredProvider ?? null,
    prospectingSearchId: input.searchId ?? null,
    exec,
    treatEmptyAsFailure: true,
  });

  // Deduplicação: cnpj → website → phone → nome+cidade/UF
  const rows = dedupeRows(result.data ?? []);

  return {
    ok: result.ok,
    provider: result.provider,
    rows,
    fallbackChain: result.chain,
    reasonByProvider: result.reasonByProvider,
    userMessage: result.ok
      ? ""
      : allEmpty(result.reasonByProvider)
        ? FRIENDLY_EMPTY
        : Object.keys(result.reasonByProvider).length > 0
          ? FRIENDLY_EXHAUSTED
          : "Nenhum provedor disponível para essa busca. Peça ao administrador para revisar as integrações.",
  };
}

function allEmpty(reasons: Record<string, string>): boolean {
  const values = Object.values(reasons);
  if (values.length === 0) return false;
  return values.every((r) => r === "empty_result" || r === "unsupported_capability");
}

function dedupeRows(rows: CompanyRow[]): CompanyRow[] {
  const byCnpj = new Map<string, CompanyRow>();
  const bySite = new Map<string, CompanyRow>();
  const byPhone = new Map<string, CompanyRow>();
  const byNameLoc = new Map<string, CompanyRow>();
  const out: CompanyRow[] = [];
  for (const r of rows) {
    const cnpj = (r.cnpj ?? "").replace(/\D/g, "");
    const site = (r.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*/, "");
    const phone = (r.phone ?? "").replace(/\D/g, "");
    const nameLoc = `${(r.company_name ?? "").trim().toLowerCase()}|${(r.city ?? "").toLowerCase()}|${(r.state ?? "").toLowerCase()}`;
    if (cnpj && byCnpj.has(cnpj)) {
      mergeInto(byCnpj.get(cnpj)!, r);
      continue;
    }
    if (!cnpj && site && bySite.has(site)) {
      mergeInto(bySite.get(site)!, r);
      continue;
    }
    if (!cnpj && !site && phone && byPhone.has(phone)) {
      mergeInto(byPhone.get(phone)!, r);
      continue;
    }
    if (!cnpj && !site && !phone && byNameLoc.has(nameLoc)) {
      mergeInto(byNameLoc.get(nameLoc)!, r);
      continue;
    }
    out.push(r);
    if (cnpj) byCnpj.set(cnpj, r);
    if (site) bySite.set(site, r);
    if (phone) byPhone.set(phone, r);
    byNameLoc.set(nameLoc, r);
  }
  return out;
}

function mergeInto(target: CompanyRow, extra: CompanyRow): void {
  for (const k of Object.keys(extra) as (keyof CompanyRow)[]) {
    if (target[k] == null && extra[k] != null) {
      (target as any)[k] = extra[k];
    }
  }
}

export const FAILOVER_USER_MESSAGE = FRIENDLY_EXHAUSTED;