import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/reengage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-guard.server");
        const denied = verifyCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: orgs } = await supabaseAdmin
          .from("app_settings")
          .select("organization_id, reengage_enabled, reengage_after_days")
          .eq("reengage_enabled", true);
        let total = 0;
        for (const s of orgs ?? []) {
          const days = s.reengage_after_days ?? 7;
          const cutoff = new Date(Date.now() - days * 86400000).toISOString();
          const { data: stale } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("organization_id", s.organization_id)
            .in("status", ["coletado", "em_cadencia"])
            .eq("opt_out", false)
            .eq("cadence_paused", false)
            .eq("ai_paused", false)
            .or(`last_inbound_at.is.null,last_inbound_at.lt.${cutoff}`)
            .lt("updated_at", cutoff)
            .limit(500);
          const ids = (stale ?? []).map((l) => l.id);
          if (ids.length === 0) continue;
          await supabaseAdmin
            .from("leads")
            .update({ cadence_day: 0, updated_at: new Date().toISOString() } as never)
            .in("id", ids);
          await supabaseAdmin.from("activity_events").insert(
            ids.map((id) => ({
              lead_id: id,
              type: "reengage_triggered",
              payload: { days_stale: days } as never,
            })),
          );
          total += ids.length;
        }
        return Response.json({ ok: true, reengaged: total });
      },
    },
  },
});