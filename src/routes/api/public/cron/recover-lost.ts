import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/recover-lost")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-guard.server");
        const denied = verifyCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: orgs } = await supabaseAdmin
          .from("app_settings")
          .select("organization_id")
          .eq("lost_recover_enabled", true);
        let recovered = 0;
        for (const o of orgs ?? []) {
          const { data: reasons } = await supabaseAdmin
            .from("lost_reasons")
            .select("code, recover_after_days")
            .eq("organization_id", o.organization_id)
            .eq("active", true);
          for (const r of reasons ?? []) {
            const cutoff = new Date(Date.now() - r.recover_after_days * 86400000).toISOString();
            const { data: leads } = await supabaseAdmin
              .from("leads")
              .select("id")
              .eq("organization_id", o.organization_id)
              .eq("status", "descartado")
              .eq("opt_out", false)
              .eq("lost_reason", r.code)
              .lt("lost_at", cutoff)
              .limit(200);
            const ids = (leads ?? []).map((l) => l.id);
            if (ids.length === 0) continue;
            await supabaseAdmin
              .from("leads")
              .update({
                status: "coletado",
                cadence_day: 0,
                cadence_paused: false,
                ai_paused: false,
              } as never)
              .in("id", ids);
            await supabaseAdmin.from("activity_events").insert(
              ids.map((id) => ({
                lead_id: id,
                type: "lost_recovered",
                payload: { reason: r.code } as never,
              })),
            );
            recovered += ids.length;
          }
        }
        return Response.json({ ok: true, recovered });
      },
    },
  },
});