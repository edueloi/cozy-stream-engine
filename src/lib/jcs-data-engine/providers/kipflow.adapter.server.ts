// KipflowAdapter — Provider oficial do JCS Data Engine.
// Server-only. Credenciais são resolvidas via `getProviderRuntimeConfig`
// (organização > plataforma > env legado). Este arquivo NÃO lê `process.env`
// diretamente.

import { emptyCompany, type NormalizedCompany, type NormalizedDecisionMaker } from "../normalizer";
import type { CompanySearchInput, HealthReport, ProviderAdapter } from "./types";
import { getProviderRuntimeConfig } from "@/lib/providers/runtime-config.server";

const DEFAULT_BASE = "https://api.kipflow.io/companies/v1";
const PROVIDER = "kipflow";

export const KIPFLOW_CAPABILITIES = [
  "company_search",
  "company_enrichment",
  "company_linkedin",
  "company_instagram",
  "company_website",
  "decision_makers",
  "professional_profile",
  "contact_enrichment",
  "company_email",
  "company_phone",
  "social_profiles",
];

async function resolveRuntime(orgId: string | null): Promise<{ key: string; base: string }> {
  const cfg = await getProviderRuntimeConfig({ organizationId: orgId, provider: PROVIDER });
  if (!cfg.apiKey) {
    throw new Error(
      "Kipflow: credencial não configurada. Peça ao administrador para cadastrar em Provedores de Dados.",
    );
  }
  // Normaliza URLs antigas (kipflow.com) para o host oficial kipflow.io.
  const raw = cfg.baseUrl || DEFAULT_BASE;
  const base = /kipflow\.com/i.test(raw) ? DEFAULT_BASE : raw;
  return { key: cfg.apiKey, base };
}

async function call(
  orgId: string | null,
  path: string,
  params: Record<string, string>,
): Promise<any> {
  const { key, base } = await resolveRuntime(orgId);
  const qs = new URLSearchParams(params).toString();
  const url = `${base}${path}?${qs}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": key, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Kipflow ${res.status}: ${body.slice(0, 240)}`);
  }
  return res.json();
}

function pick<T = any>(obj: any, ...paths: string[]): T | null {
  for (const p of paths) {
    const v = p.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), obj);
    if (v != null && v !== "") return v as T;
  }
  return null;
}

function normalizeCompany(raw: any): NormalizedCompany {
  const root = raw?.data ?? raw?.company ?? raw?.result ?? raw ?? {};
  const addr = root.address ?? root.endereco ?? {};
  const contacts = root.contacts ?? root.contato ?? {};
  const social = root.social ?? root.redes_sociais ?? {};

  const out: NormalizedCompany = {
    ...emptyCompany(PROVIDER),
    company_name:
      pick(root, "fantasy_name", "nome_fantasia", "trade_name") ??
      pick(root, "name", "razao_social", "legal_name"),
    legal_name: pick(root, "legal_name", "razao_social", "name"),
    cnpj: (pick<string>(root, "cnpj", "tax_id") ?? "").replace(/\D/g, "") || null,
    website: pick(root, "website", "site", "url"),
    linkedin: pick(social, "linkedin") ?? pick(root, "linkedin"),
    instagram: pick(social, "instagram") ?? pick(root, "instagram"),
    phone: pick(contacts, "phone", "telefone") ?? pick(root, "phone", "telefone"),
    email: pick(contacts, "email") ?? pick(root, "email"),
    address:
      pick(addr, "full", "logradouro_completo") ??
      ([addr.street ?? addr.logradouro, addr.number ?? addr.numero, addr.district ?? addr.bairro]
        .filter(Boolean)
        .join(", ") || null),
    city: pick(addr, "city", "municipio", "cidade") ?? pick(root, "city", "cidade"),
    state: pick(addr, "state", "uf", "estado") ?? pick(root, "state", "uf"),
    segment: (() => {
      // Não copiar CNAE (código numérico) para o campo Segmento — é descrição comercial.
      const raw = pick<string>(root, "segment", "segmento", "cnae_description", "atividade_principal");
      if (!raw) return null;
      const digits = String(raw).replace(/\D/g, "");
      const letters = String(raw).replace(/[^a-zA-ZÀ-ÿ]/g, "");
      if (letters.length === 0 && digits.length >= 5 && digits.length <= 7) return null;
      return raw;
    })(),
    employees: Number(pick(root, "employees", "funcionarios", "employee_count") ?? 0) || null,
    capital: Number(pick(root, "capital", "capital_social", "share_capital") ?? 0) || null,
    raw,
  };
  if (out.email) out.contacts.push({ kind: "email", value: out.email, source: PROVIDER });
  if (out.phone) out.contacts.push({ kind: "phone", value: out.phone, source: PROVIDER });
  return out;
}

function normalizeDecisionMaker(raw: any): NormalizedDecisionMaker {
  return {
    name: String(pick(raw, "name", "nome") ?? "").trim(),
    role: pick(raw, "role", "cargo", "position"),
    department: pick(raw, "department", "departamento", "area"),
    seniority: pick(raw, "seniority", "senioridade", "level"),
    linkedin: pick(raw, "linkedin", "linkedin_url"),
    email: pick(raw, "email"),
    phone: pick(raw, "phone", "telefone"),
    confidence: Number(pick(raw, "confidence", "score") ?? 60) || 60,
    source: PROVIDER,
  };
}

/**
 * Factory que retorna um adapter Kipflow para uma organização específica.
 * A credencial é resolvida a cada chamada via `getProviderRuntimeConfig`.
 */
export function createKipflowAdapter(orgId: string | null = null): ProviderAdapter {
  const adapter: ProviderAdapter = {
    name: PROVIDER,
    capabilities: KIPFLOW_CAPABILITIES,

    async health(): Promise<HealthReport> {
      const started = Date.now();
      try {
        await call(orgId, "/search", { cnpj: "33000167000101", datasets: "basic" });
        return {
          provider: PROVIDER,
          online: true,
          api_ok: true,
          latency_ms: Date.now() - started,
          checked_at: new Date().toISOString(),
        };
      } catch (e) {
        return {
          provider: PROVIDER,
          online: false,
          api_ok: false,
          latency_ms: Date.now() - started,
          last_error: (e as Error).message,
          checked_at: new Date().toISOString(),
        };
      }
    },

    async companySearch(input: CompanySearchInput): Promise<NormalizedCompany[]> {
      if (!input.cnpj) return [];
      const raw = await call(orgId, "/search", {
        cnpj: input.cnpj.replace(/\D/g, ""),
        datasets: "basic",
      });
      const list = Array.isArray(raw?.results) ? raw.results : [raw];
      return list.map(normalizeCompany).filter((c: NormalizedCompany) => c.cnpj || c.company_name);
    },

    async companyEnrichment({ cnpj }): Promise<NormalizedCompany | null> {
      const raw = await call(orgId, "/search", {
        cnpj: cnpj.replace(/\D/g, ""),
        datasets: "basic,contacts,social",
      });
      return normalizeCompany(raw);
    },

    async findDecisionMakers({ cnpj, limit = 10 }): Promise<NormalizedDecisionMaker[]> {
      try {
        const raw = await call(orgId, "/search", {
          cnpj: cnpj.replace(/\D/g, ""),
          datasets: "decision_makers",
        });
        const list =
          raw?.decision_makers ?? raw?.data?.decision_makers ?? raw?.result?.decision_makers ?? [];
        return (Array.isArray(list) ? list : []).slice(0, limit).map(normalizeDecisionMaker);
      } catch {
        return [];
      }
    },

    async professionalProfile(): Promise<NormalizedDecisionMaker | null> {
      return null;
    },

    async contactEnrichment({ cnpj }): Promise<Partial<NormalizedCompany> | null> {
      if (!cnpj) return null;
      const c = await adapter.companyEnrichment!({ cnpj });
      if (!c) return null;
      return { email: c.email, phone: c.phone, linkedin: c.linkedin, instagram: c.instagram };
    },
  };
  return adapter;
}

// Singleton retro-compatível para o registry estático. Consumidores com orgId
// devem usar `getAdapter(name, orgId)` no registry.
export const KipflowAdapter = createKipflowAdapter(null);
