import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  razao_social: z.string().min(1).max(200).optional(),
  nome_fantasia: z.string().max(200).optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().max(40).optional(),
  telefone: z.string().max(40).optional(),
  segmento: z.string().max(120).optional(),
  cidade: z.string().max(120).optional(),
  estado: z.string().max(40).optional(),
  mensagem: z.string().max(2000).optional(),
  origem: z.string().max(80).optional(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-inbound-token",
};

export const Route = createFileRoute("/api/public/inbound-lead")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          request.headers.get("x-inbound-token") ?? url.searchParams.get("token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!token) return new Response("unauthorized", { status: 401, headers: CORS });
        const { data: s } = await supabaseAdmin
          .from("app_settings")
          .select("inbound_token, organization_id")
          .eq("inbound_token", token)
          .maybeSingle();
        if (!s?.inbound_token) {
          return new Response("unauthorized", { status: 401, headers: CORS });
        }
        const orgId = s.organization_id;
        const body = await request.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { ok: false, errors: parsed.error.flatten() },
            { status: 400, headers: CORS },
          );
        }
        const d = parsed.data;
        if (!d.email && !d.whatsapp && !d.telefone) {
          return Response.json(
            { ok: false, error: "Informe email, whatsapp ou telefone." },
            { status: 400, headers: CORS },
          );
        }
        const { data: lead, error } = await supabaseAdmin
          .from("leads")
          .insert({
            razao_social: d.razao_social ?? d.nome_fantasia ?? d.email ?? "Inbound",
            nome_fantasia: d.nome_fantasia,
            email: d.email,
            whatsapp: d.whatsapp,
            telefone: d.telefone,
            segmento: d.segmento,
            cidade: d.cidade,
            estado: d.estado,
            source: d.origem ?? "inbound",
            status: "qualificado",
            score: 80,
            organization_id: orgId,
          } as never)
          .select("id")
          .single();
        if (error) {
          console.error("[inbound-lead] insert error:", error);
          return Response.json(
            { ok: false, error: "Erro interno. Tente novamente." },
            { status: 500, headers: CORS },
          );
        }
        await supabaseAdmin.from("activity_events").insert({
          lead_id: lead.id,
          type: "inbound_received",
          payload: { mensagem: d.mensagem ?? null, source: d.origem ?? "inbound" } as never,
        });
        return Response.json({ ok: true, lead_id: lead.id }, { headers: CORS });
      },
    },
  },
});