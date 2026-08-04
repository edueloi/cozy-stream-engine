/** Orbit CRM integration. Server-only. Tokens never leave the backend. */

export type OrbitConfig = {
  api_url: string;
  api_token: string;
  default_pipeline_id?: string | null;
  qualified_stage_id?: string | null;
  meeting_stage_id?: string | null;
  lost_stage_id?: string | null;
  default_owner_id?: string | null;
  auto_sync_enabled?: boolean;
  score_threshold?: number;
};

function maskToken(t: string | undefined | null) {
  if (!t) return "";
  if (t.length <= 6) return "••••";
  return "••••" + t.slice(-4);
}

export function maskedConfig(cfg: Partial<OrbitConfig> | null | undefined) {
  if (!cfg) return null;
  return {
    api_url: cfg.api_url ?? "",
    api_token_masked: maskToken(cfg.api_token),
    default_pipeline_id: cfg.default_pipeline_id ?? "",
    qualified_stage_id: cfg.qualified_stage_id ?? "",
    meeting_stage_id: cfg.meeting_stage_id ?? "",
    lost_stage_id: cfg.lost_stage_id ?? "",
    default_owner_id: cfg.default_owner_id ?? "",
    auto_sync_enabled: cfg.auto_sync_enabled ?? false,
    score_threshold: cfg.score_threshold ?? 70,
  };
}

export async function getOrbitConfigForOrg(orgId: string): Promise<OrbitConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("organization_integrations")
    .select("config, active")
    .eq("organization_id", orgId)
    .eq("provider", "orbit")
    .maybeSingle();
  if (!data || !data.active) return null;
  const c = (data.config as Partial<OrbitConfig>) ?? {};
  if (!c.api_url || !c.api_token) return null;
  return c as OrbitConfig;
}

function joinUrl(base: string, path: string) {
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

async function orbitFetch(cfg: OrbitConfig, path: string, init: RequestInit = {}) {
  const res = await fetch(joinUrl(cfg.api_url, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.api_token}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

export async function testOrbitConnection(cfg: OrbitConfig) {
  try {
    const r = await orbitFetch(cfg, "/ping");
    if (r.ok) return { ok: true, status: r.status };
    // fallback: try /me or /pipelines
    const r2 = await orbitFetch(cfg, "/pipelines");
    return { ok: r2.ok, status: r2.status, error: r2.ok ? null : `HTTP ${r2.status}` };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

export type OrbitPipeline = {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
};

/** Fetch pipelines + stages from Orbit. Best-effort: handles a few common shapes. */
export async function listOrbitPipelines(cfg: OrbitConfig): Promise<OrbitPipeline[]> {
  // Try a list of well-known endpoints to be robust to API variations.
  const candidates = [
    "/pipelines",
    "/v1/pipelines",
    "/api/pipelines",
    "/api/v1/pipelines",
    "/funnels",
    "/v1/funnels",
    "/api/funnels",
    "/crm/pipelines",
    "/sales/pipelines",
  ];
  let r: { ok: boolean; status: number; body: unknown } | null = null;
  let lastStatus = 0;
  for (const path of candidates) {
    try {
      const resp = await orbitFetch(cfg, path);
      lastStatus = resp.status;
      if (resp.ok) {
        r = resp;
        break;
      }
    } catch {
      // try next
    }
  }
  if (!r) throw new Error(`Falha ao listar funis (HTTP ${lastStatus || "?"})`);
  const body = r.body as unknown;
  const extractArray = (b: unknown): unknown[] => {
    if (Array.isArray(b)) return b;
    if (b && typeof b === "object") {
      const obj = b as Record<string, unknown>;
      for (const key of ["items", "data", "pipelines", "funnels", "results", "records"]) {
        if (Array.isArray(obj[key])) return obj[key] as unknown[];
      }
      // fallback: first array property
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) return v as unknown[];
      }
    }
    return [];
  };
  const raw: unknown[] = extractArray(body);
  const pipelines: OrbitPipeline[] = [];
  for (const p of raw) {
    const pp = p as Record<string, unknown>;
    const id = String(pp.id ?? pp.pipeline_id ?? pp.funnel_id ?? pp._id ?? pp.uuid ?? "");
    const name = String(pp.name ?? pp.title ?? id);
    if (!id) continue;
    let stagesRaw: unknown[] =
      (Array.isArray(pp.stages) && (pp.stages as unknown[])) ||
      (Array.isArray((pp as { steps?: unknown[] }).steps) && ((pp as { steps: unknown[] }).steps)) ||
      (Array.isArray((pp as { phases?: unknown[] }).phases) && ((pp as { phases: unknown[] }).phases)) ||
      (Array.isArray((pp as { etapas?: unknown[] }).etapas) && ((pp as { etapas: unknown[] }).etapas)) ||
      [];
    if (stagesRaw.length === 0) {
      const stagePaths = [
        `/pipelines/${encodeURIComponent(id)}/stages`,
        `/funnels/${encodeURIComponent(id)}/stages`,
        `/pipelines/${encodeURIComponent(id)}/steps`,
        `/stages?pipeline_id=${encodeURIComponent(id)}`,
      ];
      for (const sp of stagePaths) {
        try {
          const rs = await orbitFetch(cfg, sp);
          if (rs.ok) {
            stagesRaw = extractArray(rs.body);
            if (stagesRaw.length > 0) break;
          }
        } catch {
          // try next
        }
      }
    }
    const stages = stagesRaw.map((s) => {
      const ss = s as Record<string, unknown>;
      return {
        id: String(ss.id ?? ss.stage_id ?? ss._id ?? ss.uuid ?? ""),
        name: String(ss.name ?? ss.title ?? ss.id ?? ""),
      };
    }).filter((s) => s.id);
    pipelines.push({ id, name, stages });
  }
  return pipelines;
}

type LeadRow = {
  id: string;
  organization_id: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  contato_nome?: string | null;
  cargo?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cidade?: string | null;
  estado?: string | null;
  origem?: string | null;
  score?: number | null;
  status?: string | null;
  segmento?: string | null;
  cnpj?: string | null;
  dor?: string | null;
  objecoes?: string | null;
  ai_summary?: string | null;
  next_action?: string | null;
  agent_id?: string | null;
  cadence_id?: string | null;
  orbit_contact_id?: string | null;
  orbit_company_id?: string | null;
  orbit_deal_id?: string | null;
};

function maskPayloadForLog(p: Record<string, unknown>) {
  const clone = { ...p };
  if (typeof clone.api_token === "string") clone.api_token = maskToken(clone.api_token);
  return clone;
}

async function logSync(
  orgId: string,
  leadId: string | null,
  event: string,
  status: string,
  request: unknown,
  response: unknown,
  errorMessage?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("orbit_sync_logs").insert({
    organization_id: orgId,
    lead_id: leadId,
    event_type: event,
    status,
    request_payload: maskPayloadForLog((request as Record<string, unknown>) ?? {}) as never,
    response_payload: (response ?? null) as never,
    error_message: errorMessage ?? null,
  } as never);
}

async function findExistingDeal(cfg: OrbitConfig, lead: LeadRow) {
  const queries: string[] = [];
  if (lead.email) queries.push(`email=${encodeURIComponent(lead.email)}`);
  if (lead.whatsapp) queries.push(`phone=${encodeURIComponent(lead.whatsapp)}`);
  if (lead.telefone) queries.push(`phone=${encodeURIComponent(lead.telefone)}`);
  if (lead.cnpj) queries.push(`cnpj=${encodeURIComponent(lead.cnpj)}`);
  for (const q of queries) {
    const r = await orbitFetch(cfg, `/deals/search?${q}`);
    if (r.ok && r.body && Array.isArray((r.body as { items?: unknown[] }).items)) {
      const items = (r.body as { items: { id?: string }[] }).items;
      if (items.length > 0 && items[0].id) return items[0].id;
    }
  }
  return null;
}

async function fetchHistory(orgId: string, leadId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: msgs }, { data: calls }] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("id, channel, direction, content, created_at")
      .eq("organization_id", orgId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(200),
    supabaseAdmin
      .from("calls")
      .select("id, call_type, call_status, summary, qualification_score, duration_seconds, created_at")
      .eq("organization_id", orgId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);
  return { messages: msgs ?? [], calls: calls ?? [] };
}

function buildOrbitPayload(lead: LeadRow, history: { messages: unknown[]; calls: unknown[] }, cfg: OrbitConfig) {
  return {
    company: {
      name: lead.nome_fantasia || lead.razao_social || "",
      legal_name: lead.razao_social ?? null,
      cnpj: lead.cnpj ?? null,
      city: lead.cidade ?? null,
      state: lead.estado ?? null,
      segment: lead.segmento ?? null,
    },
    contact: {
      name: lead.contato_nome ?? null,
      role: lead.cargo ?? null,
      email: lead.email ?? null,
      phone: lead.telefone ?? null,
      whatsapp: lead.whatsapp ?? null,
    },
    deal: {
      pipeline_id: cfg.default_pipeline_id ?? null,
      stage_id: cfg.qualified_stage_id ?? null,
      owner_id: cfg.default_owner_id ?? null,
      source: lead.origem ?? "JCS SDR",
      score: lead.score ?? 0,
      status: lead.status ?? null,
      pain: lead.dor ?? null,
      objections: lead.objecoes ?? null,
      summary: lead.ai_summary ?? null,
      next_action: lead.next_action ?? null,
      agent_id: lead.agent_id ?? null,
      cadence_id: lead.cadence_id ?? null,
    },
    history,
  };
}

/** Sync a lead to Orbit. Returns the updated lead orbit_* fields. */
export async function syncLeadToOrbit(orgId: string, leadId: string, opts: { force?: boolean } = {}) {
  const cfg = await getOrbitConfigForOrg(orgId);
  if (!cfg) throw new Error("Integração Orbit não configurada para a organização.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new Error("Lead não encontrado.");
  const l = lead as LeadRow;

  if (l.orbit_deal_id && !opts.force) {
    return { ok: true, skipped: true, deal_id: l.orbit_deal_id };
  }

  // dedup
  const existing = await findExistingDeal(cfg, l);
  if (existing && !opts.force) {
    await supabaseAdmin
      .from("leads")
      .update({
        orbit_deal_id: existing,
        orbit_sync_status: "duplicate_found",
        orbit_synced_at: new Date().toISOString(),
      } as never)
      .eq("id", leadId);
    await logSync(orgId, leadId, "create_deal", "duplicate_found", { lead_id: leadId }, { deal_id: existing });
    return { ok: true, duplicate: true, deal_id: existing };
  }

  const history = await fetchHistory(orgId, leadId);
  const payload = buildOrbitPayload(l, history, cfg);

  const r = await orbitFetch(cfg, "/deals", { method: "POST", body: JSON.stringify(payload) });
  if (!r.ok) {
    await supabaseAdmin
      .from("leads")
      .update({ orbit_sync_status: "failed", orbit_sync_error: `HTTP ${r.status}` } as never)
      .eq("id", leadId);
    await logSync(orgId, leadId, "create_deal", "failed", payload, r.body, `HTTP ${r.status}`);
    throw new Error(`Falha ao enviar para Orbit (HTTP ${r.status})`);
  }
  const body = (r.body ?? {}) as {
    deal_id?: string;
    contact_id?: string;
    company_id?: string;
    pipeline_id?: string;
    stage_id?: string;
  };
  await supabaseAdmin
    .from("leads")
    .update({
      orbit_deal_id: body.deal_id ?? null,
      orbit_contact_id: body.contact_id ?? null,
      orbit_company_id: body.company_id ?? null,
      orbit_pipeline_id: body.pipeline_id ?? cfg.default_pipeline_id ?? null,
      orbit_stage_id: body.stage_id ?? cfg.qualified_stage_id ?? null,
      orbit_synced_at: new Date().toISOString(),
      orbit_sync_status: "synced",
      orbit_sync_error: null,
    } as never)
    .eq("id", leadId);
  await logSync(orgId, leadId, "create_deal", "synced", payload, body);
  return { ok: true, deal_id: body.deal_id };
}

/** Auto-sync hook: call after a lead becomes qualified. */
export async function maybeAutoSyncLead(orgId: string, leadId: string) {
  const cfg = await getOrbitConfigForOrg(orgId);
  if (!cfg || !cfg.auto_sync_enabled) return { skipped: true, reason: "disabled" };
  const threshold = cfg.score_threshold ?? 70;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("status, score, orbit_deal_id")
    .eq("id", leadId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!lead) return { skipped: true, reason: "not_found" };
  const ld = lead as { status: string; score: number | null; orbit_deal_id: string | null };
  if (ld.orbit_deal_id) return { skipped: true, reason: "already_synced" };
  const qualifiedStatuses = ["qualified", "qualificado"];
  if (!qualifiedStatuses.includes(ld.status)) return { skipped: true, reason: "not_qualified" };
  if ((ld.score ?? 0) < threshold) return { skipped: true, reason: "below_threshold" };
  try {
    return await syncLeadToOrbit(orgId, leadId);
  } catch (e) {
    return { skipped: false, ok: false, error: (e as Error).message };
  }
}

/** Backwards-compat for voice-ai.functions.ts */
export async function pushOpportunityToOrbit(
  supabase: { from: (t: string) => { insert: (v: unknown) => Promise<{ error: { message: string } | null }> } },
  payload: { call_id: string; lead_id: string; summary: string; score: number; recommended_product: string | null },
) {
  const { error } = await supabase.from("activity_events").insert({
    lead_id: payload.lead_id,
    type: "orbit_pending",
    payload: payload as never,
  } as never);
  if (error) throw new Error(error.message);
  return { ok: true };
}