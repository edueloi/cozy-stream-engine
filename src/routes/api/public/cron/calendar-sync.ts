import { createFileRoute } from "@tanstack/react-router";

// Pull events from each active calendar connection, reconcile meetings_v2 status.
export const Route = createFileRoute("/api/public/cron/calendar-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-guard.server");
        const denied = verifyCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { googleListEvents, microsoftListEvents, refreshGoogleToken, refreshMicrosoftToken } = await import("@/lib/calendar.server");
        const { logSchedulingEvent } = await import("@/lib/scheduling.server");
        const { data: conns } = await supabaseAdmin
          .from("calendar_connections")
          .select("*")
          .eq("enabled", true);
        const list = conns ?? [];
        const fromIso = new Date(Date.now() - 86400000).toISOString();
        const toIso = new Date(Date.now() + 30 * 86400000).toISOString();
        let synced = 0;
        for (const c of list) {
          try {
            let token = c.access_token as string;
            const expSoon = !c.expires_at || new Date(c.expires_at).getTime() < Date.now() + 60000;
            if (expSoon && c.refresh_token) {
              const tok = c.provider === "google"
                ? await refreshGoogleToken({ refreshToken: c.refresh_token, clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET! })
                : await refreshMicrosoftToken({ refreshToken: c.refresh_token, clientId: process.env.MS_OAUTH_CLIENT_ID!, clientSecret: process.env.MS_OAUTH_CLIENT_SECRET!, tenant: process.env.MS_OAUTH_TENANT ?? "common" });
              token = tok.access_token;
              await supabaseAdmin.from("calendar_connections").update({
                access_token: tok.access_token,
                refresh_token: tok.refresh_token ?? c.refresh_token,
                expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
                needs_reauth: false,
              } as never).eq("id", c.id);
            }
            const events = c.provider === "google"
              ? await googleListEvents({ accessToken: token, timeMin: fromIso, timeMax: toIso, timezone: c.timezone })
              : await microsoftListEvents({ accessToken: token, timeMin: fromIso, timeMax: toIso, timezone: c.timezone });
            const eventIds = new Set(events.map((e) => e.id));
            // any of our scheduled meetings whose external id no longer exists → mark cancelled
            const { data: ours } = await supabaseAdmin
              .from("meetings_v2")
              .select("id, external_event_id, start_at, end_at, status")
              .eq("owner_user_id", c.user_id)
              .eq("provider", c.provider)
              .gte("start_at", fromIso)
              .lte("start_at", toIso);
            for (const m of (ours ?? [])) {
              if (!m.external_event_id) continue;
              if (!eventIds.has(m.external_event_id) && m.status === "scheduled") {
                await supabaseAdmin.from("meetings_v2").update({ status: "cancelled", last_synced_at: new Date().toISOString() } as never).eq("id", m.id);
              } else {
                const ev = events.find((e) => e.id === m.external_event_id);
                if (ev && (ev.start !== m.start_at || ev.end !== m.end_at)) {
                  await supabaseAdmin.from("meetings_v2").update({ start_at: ev.start, end_at: ev.end, last_synced_at: new Date().toISOString() } as never).eq("id", m.id);
                }
              }
            }
            synced++;
          } catch (e) {
            await logSchedulingEvent(supabaseAdmin, { organization_id: c.organization_id, user_id: c.user_id, action: "error", provider: c.provider, error: (e as Error).message });
            await supabaseAdmin.from("calendar_connections").update({ needs_reauth: true } as never).eq("id", c.id);
          }
        }
        return Response.json({ ok: true, synced });
      },
    },
  },
});