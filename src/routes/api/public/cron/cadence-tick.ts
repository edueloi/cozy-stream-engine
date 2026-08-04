import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/cadence-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-guard.server");
        const denied = verifyCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendCadenceStep } = await import("@/lib/outreach.functions");
        const { data: leads } = await supabaseAdmin
          .from("leads")
          .select("id, cadence_status")
          .eq("status", "em_cadencia")
          .eq("cadence_paused", false)
          .eq("opt_out", false)
          .eq("ai_paused", false)
          .not("cadence_status", "in", "(paused,stopped,replied,qualified,completed)")
          .order("updated_at", { ascending: true })
          .limit(1);
        let sent = 0;
        let failed = 0;
        for (const lead of leads ?? []) {
          try {
            await sendCadenceStep(supabaseAdmin, lead.id);
            sent++;
          } catch {
            failed++;
          }
        }
        return Response.json({ ok: true, checked: leads?.length ?? 0, sent, failed });
      },
    },
  },
});