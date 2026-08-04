// Server-only wrapper for the Casa dos Dados enterprise API (v5).
// Docs: https://docs.casadosdados.com.br  (endpoint v5/cnpj/pesquisa)
// Credenciais são resolvidas SEMPRE via `getProviderRuntimeConfig` na Central
// de Provedores. Este módulo NUNCA lê `process.env` diretamente.
const DEFAULT_BASE = "https://api.casadosdados.com.br/v5";

export interface CasaDosDadosFilters {
  cnae_principal?: string;
  cnaes_secundarios?: string; // comma-separated
  uf?: string;
  cidade?: string;
  porte?: string | string[];
  situacao_cadastral?: string;
  natureza_juridica?: string;
  data_abertura_de?: string;
  data_abertura_ate?: string;
  capital_social_min?: number;
  capital_social_max?: number;
  limite?: number;
  // Filtros aplicados após o retorno da API:
  com_telefone?: boolean;
  com_email?: boolean;
  com_celular?: boolean;
}

export interface CasaDosDadosCompany {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnae_principal: string | null;
  cnaes_secundarios: string[];
  porte: string | null;
  situacao_cadastral: string | null;
  natureza_juridica: string | null;
  data_abertura: string | null;
  capital_social: number | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  raw: any;
}

function pickArray(v?: string): string[] {
  return (v ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Códigos de porte aceitos pela API v5 da Casa dos Dados:
// 01 = Micro Empresa, 03 = Empresa de Pequeno Porte, 05 = Demais
const PORTE_MAP: Record<string, string> = {
  MEI: "01",
  ME: "01",
  EPP: "03",
  DEMAIS: "05",
};

function normalizeText(value?: string | null): string | undefined {
  const normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

export async function searchCasaDosDados(
  apiKey: string | undefined,
  filters: CasaDosDadosFilters,
  options?: { baseUrl?: string | null },
): Promise<CasaDosDadosCompany[]> {
  if (!apiKey) {
    throw new Error(
      "Casa dos Dados: credencial não configurada. Peça ao administrador para cadastrar a chave em Configurações → Provedores de Dados.",
    );
  }
  const baseUrl = (options?.baseUrl && options.baseUrl.trim()) || DEFAULT_BASE;
  const limit = Math.max(1, Math.min(1000, Number(filters.limite ?? 100)));
  const perPage = 50;
  const totalPages = Math.ceil(limit / perPage);

  const atividade = [
    ...(filters.cnae_principal ? [filters.cnae_principal] : []),
    ...pickArray(filters.cnaes_secundarios),
  ].map((c) => String(c).replace(/\D/g, ""));

  const porteCodes = (Array.isArray(filters.porte) ? filters.porte : filters.porte ? [filters.porte] : [])
    .map((p) => PORTE_MAP[p] ?? p)
    .filter(Boolean);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "JcsProspectingBot/1.0",
    "api-key": apiKey,
  };

  const out: CasaDosDadosCompany[] = [];
  // Alguns planos da Casa dos Dados não permitem `tipo_resultado=completo`
  // (retorna 403). Nesse caso, refazemos com `simples` automaticamente.
  let tipoResultado: "completo" | "simples" = "completo";
  for (let page = 1; page <= totalPages; page++) {
    const body: Record<string, any> = {
      codigo_atividade_principal: atividade,
      incluir_atividade_secundaria: false,
      situacao_cadastral: [filters.situacao_cadastral || "ATIVA"],
      uf: normalizeText(filters.uf) ? [normalizeText(filters.uf)] : undefined,
      municipio: normalizeText(filters.cidade) ? [normalizeText(filters.cidade)] : undefined,
      codigo_natureza_juridica: filters.natureza_juridica ? [filters.natureza_juridica] : undefined,
      porte_empresa: porteCodes.length > 0 ? { codigos: porteCodes } : undefined,
      capital_social:
        filters.capital_social_min != null || filters.capital_social_max != null
          ? {
              minimo: filters.capital_social_min ?? 0,
              maximo: filters.capital_social_max ?? 0,
            }
          : undefined,
      data_abertura:
        filters.data_abertura_de || filters.data_abertura_ate
          ? {
              inicio: filters.data_abertura_de ?? undefined,
              fim: filters.data_abertura_ate ?? undefined,
            }
          : undefined,
      mais_filtros: {
        com_email: filters.com_email || undefined,
        com_telefone: filters.com_telefone || undefined,
        somente_celular: filters.com_celular || undefined,
      },
      limite: perPage,
      pagina: page,
    };
    // remove undefined
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    if (body.mais_filtros) {
      for (const k of Object.keys(body.mais_filtros)) {
        if (body.mais_filtros[k] === undefined) delete body.mais_filtros[k];
      }
      if (Object.keys(body.mais_filtros).length === 0) delete body.mais_filtros;
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/cnpj/pesquisa?tipo_resultado=${tipoResultado}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`Casa dos Dados: falha de rede - ${(e as Error).message}`);
    }
    if (res.status === 403 && tipoResultado === "completo") {
      // Fallback para plano que só libera resultado simples.
      tipoResultado = "simples";
      page--; // repete a mesma página
      continue;
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const snippet = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
      // "Sem saldo para a operação" vem como HTTP 403 — classificar
      // como insufficient_balance (não invalid_credentials) para o failover.
      if (/sem\s+saldo|insufficient|no\s+balance|sem\s+cr[eé]dito/i.test(snippet)) {
        const err: any = new Error(`Casa dos Dados sem saldo: ${snippet || "insufficient_balance"}`);
        err.status = 402;
        err.category = "insufficient_balance";
        throw err;
      }
      if (res.status === 401 || res.status === 403) {
        const err: any = new Error(
          `Casa dos Dados ${res.status}: endpoint sem permissão nesse plano ou chave inválida. Verifique o plano da conta (a rota /cnpj/pesquisa exige plano com API habilitada). Detalhe: ${snippet || "sem corpo"}`,
        );
        err.status = res.status;
        throw err;
      }
      const err: any = new Error(`Casa dos Dados ${res.status}: ${snippet}`);
      err.status = res.status;
      throw err;
    }
    const json: any = await res.json();
    const rows: any[] = Array.isArray(json?.cnpjs)
      ? json.cnpjs
      : Array.isArray(json?.data)
        ? json.data
        : [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (out.length >= limit) break;
      out.push(mapCompany(r));
    }
    if (rows.length < perPage) break;
    if (out.length >= limit) break;
  }
  return out;
}

function mapCompany(r: any): CasaDosDadosCompany {
  // Formato v5 (endpoint /cnpj/pesquisa). Campos reais confirmados:
  //   endereco{cep,tipo_logradouro,logradouro,numero,complemento,bairro,uf,municipio}
  //   situacao_cadastral{situacao_atual,motivo,data}
  //   atividade_principal{codigo,descricao}
  //   atividade_secundaria:[{codigo,descricao}]
  //   contato_telefonico:[{completo,ddd,numero,tipo}]
  //   contato_email:[{email} | string]
  //   porte_empresa{codigo,descricao}
  const end = r.endereco ?? {};
  const enderecoStr = [
    [end.tipo_logradouro, end.logradouro].filter(Boolean).join(" ").trim(),
    end.numero,
    end.complemento,
    end.bairro,
    end.cep,
  ]
    .filter(Boolean)
    .join(", ");

  const secundarias = Array.isArray(r.atividade_secundaria)
    ? r.atividade_secundaria.map((c: any) => c?.codigo ?? c).filter(Boolean)
    : Array.isArray(r.atividades_secundarias)
      ? r.atividades_secundarias.map((c: any) => c?.codigo ?? c).filter(Boolean)
      : [];

  const cnaePrincipal =
    r.atividade_principal?.codigo ??
    (Array.isArray(r.atividade_principal) ? r.atividade_principal[0]?.codigo : null) ??
    r.codigo_atividade_principal ??
    null;

  const situacao =
    r.situacao_cadastral?.situacao_atual ??
    r.situacao_cadastral?.situacao_cadastral ??
    (typeof r.situacao_cadastral === "string" ? r.situacao_cadastral : null) ??
    r.situacao ??
    null;

  const tels: any[] = Array.isArray(r.contato_telefonico) ? r.contato_telefonico : [];
  const telefone =
    tels.find((t) => t?.tipo?.toLowerCase?.().includes("cel"))?.completo ??
    tels[0]?.completo ??
    (tels[0]?.ddd && tels[0]?.numero ? `${tels[0].ddd}${tels[0].numero}` : null) ??
    r.telefone ??
    null;

  const emails: any[] = Array.isArray(r.contato_email) ? r.contato_email : [];
  const email =
    (typeof emails[0] === "string" ? emails[0] : emails[0]?.email ?? emails[0]?.endereco) ??
    r.email ??
    null;

  return {
    cnpj: String(r.cnpj ?? r.CNPJ ?? "").replace(/\D/g, ""),
    razao_social: r.razao_social ?? r.nome ?? "",
    nome_fantasia: r.nome_fantasia ?? r.fantasia ?? null,
    cnae_principal: cnaePrincipal,
    cnaes_secundarios: secundarias,
    porte: r.porte_empresa?.descricao ?? r.porte ?? null,
    situacao_cadastral: situacao,
    natureza_juridica:
      r.descricao_natureza_juridica ??
      r.natureza_juridica?.descricao ??
      r.codigo_natureza_juridica ??
      r.natureza_juridica?.codigo ??
      (typeof r.natureza_juridica === "string" ? r.natureza_juridica : null) ??
      null,
    data_abertura: (r.data_abertura ?? r.data_inicio_atividade ?? "").toString().slice(0, 10) || null,
    capital_social: r.capital_social != null ? Number(r.capital_social) : null,
    endereco: enderecoStr || null,
    cidade: end.municipio ?? r.municipio ?? r.cidade ?? null,
    uf: (end.uf ?? r.uf ?? r.estado ?? null)?.toString?.().toUpperCase?.() ?? null,
    telefone: telefone ?? null,
    email,
    site: r.site ?? null,
    raw: r,
  };
}
