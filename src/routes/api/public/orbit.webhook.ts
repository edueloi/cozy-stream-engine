import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-orbit-token",
};

const schema = z.object({
  event: z.enum(["deal.won", "deal.lost", "deal.stage_changed", "deal.comment", "deal.meeting_scheduled"]),
  organization_id: z.string().uuid().optional(),
  deal_id: z.string(),
  stage_id: z.string().optional(),
  pipeline_id: z.string().optional(),
  comment: z.string().optional(),
  meeting_at: z.string().optional(),
});

export const Route = createFileRoute("/api/public/orbit/webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const token = request.headers.get("x-orbit-token") ?? "";
        const body = await request.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response("invalid payload", { status: 400, headers: CORS });
        }
        const ev = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find the lead by orbit_deal_id; require its org's orbit token to match.
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, organization_id")
          .eq("orbit_deal_id", ev.deal_id)
          .maybeSingle();
        if (!lead) return new Response("not found", { status: 404, headers: CORS });

        const { data: integ } = await supabaseAdmin
          .from("organization_integrations")
          .select("config")
          .eq("organization_id", lead.organization_id!)
          .eq("provider", "orbit")
          .maybeSingle();
        const cfg = (integ?.config as { api_token?: string; webhook_token?: string } | null) ?? null;
        const expected = cfg?.webhook_token ?? cfg?.api_token ?? "";
        if (!expected || token !== expected) {
          return new Response("unauthorized", { status: 401, headers: CORS });
        }

        const updates: Record<string, unknown> = {};
        if (ev.event === "deal.won") updates.status = "convertido";
        if (ev.event === "deal.lost") updates.status = "descartado";
        if (ev.event === "deal.meeting_scheduled") updates.status = "reuniao";
        if (ev.stage_id) updates.orbit_stage_id = ev.stage_id;
        if (ev.pipeline_id) updates.orbit_pipeline_id = ev.pipeline_id;

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from("leads").update(updates as never).eq("id", lead.id);
        }

        await supabaseAdmin.from("orbit_sync_logs").insert({
          organization_id: lead.organization_id,
          lead_id: lead.id,
          event_type: ev.event,
          status: "received",
          request_payload: ev as never,
          response_payload: null,
        } as never);

        await supabaseAdmin.from("activity_events").insert({
          lead_id: lead.id,
          organization_id: lead.organization_id,
          type: `orbit.${ev.event}`,
          payload: ev as never,
        } as never);

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});