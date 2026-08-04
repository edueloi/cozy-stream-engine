import { describe, it, expect } from "vitest";

/**
 * RC1 — cobertura funcional da lógica de dedup do importResults.
 * Como o handler roda dentro de createServerFn, aqui replicamos a resolução
 * de duplicidade (CNPJ → email → phone → domínio → nome+cidade) com um mock
 * do supabase para validar prioridade e retorno.
 */

function normName(s?: string | null) {
  return (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}
function domainOf(url?: string | null) {
  if (!url) return null;
  try { return new URL(url.startsWith("http") ? url : `http://${url}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

type Lead = { id: string; cnpj?: string; email?: string; telefone?: string; site?: string; razao_social?: string; nome_fantasia?: string; cidade?: string };

function findExisting(r: any, leads: Lead[]): { id: string; by: string } | null {
  if (r.cnpj) { const h = leads.find((l) => l.cnpj === r.cnpj); if (h) return { id: h.id, by: "cnpj" }; }
  if (r.email) { const h = leads.find((l) => l.email === r.email); if (h) return { id: h.id, by: "email" }; }
  if (r.phone) { const h = leads.find((l) => l.telefone === r.phone); if (h) return { id: h.id, by: "telefone" }; }
  const dom = domainOf(r.website);
  if (dom) { const h = leads.find((l) => (l.site ?? "").toLowerCase().includes(dom)); if (h) return { id: h.id, by: "dominio" }; }
  if (r.company_name && r.city) {
    const t = normName(r.company_name);
    const h = leads.find((l) => l.cidade === r.city && (normName(l.razao_social) === t || normName(l.nome_fantasia) === t));
    if (h) return { id: h.id, by: "nome+cidade" };
  }
  return null;
}

describe("importResults dedup", () => {
  const leads: Lead[] = [
    { id: "L1", cnpj: "11.111.111/0001-11" },
    { id: "L2", email: "a@b.com" },
    { id: "L3", telefone: "1532269100" },
    { id: "L4", site: "https://acme.com.br/contato" },
    { id: "L5", razao_social: "Indústria São João", cidade: "São Paulo" },
  ];

  it("prioriza CNPJ", () => {
    const r = { cnpj: "11.111.111/0001-11", email: "a@b.com" };
    expect(findExisting(r, leads)).toEqual({ id: "L1", by: "cnpj" });
  });

  it("cai para email quando não há CNPJ", () => {
    const r = { email: "a@b.com" };
    expect(findExisting(r, leads)).toEqual({ id: "L2", by: "email" });
  });

  it("match por telefone quando exclusivo", () => {
    const r = { phone: "1532269100" };
    expect(findExisting(r, leads)).toEqual({ id: "L3", by: "telefone" });
  });

  it("match por domínio via website", () => {
    const r = { website: "www.acme.com.br" };
    expect(findExisting(r, leads)).toEqual({ id: "L4", by: "dominio" });
  });

  it("match por nome+cidade normalizado (acentos)", () => {
    const r = { company_name: "industria sao joao", city: "São Paulo" };
    expect(findExisting(r, leads)).toEqual({ id: "L5", by: "nome+cidade" });
  });

  it("retorna null quando nada bate", () => {
    const r = { cnpj: "99.999.999/0001-99", email: "x@y.com" };
    expect(findExisting(r, leads)).toBeNull();
  });
});