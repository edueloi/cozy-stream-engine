import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/calendar/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        const origin = `${url.protocol}//${url.host}`;
        const redirectUri = `${origin}/api/public/calendar/oauth/callback`;

        const { verifyState, exchangeGoogleCode, exchangeMicrosoftCode } = await import("@/lib/calendar.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const back = (params: Record<string, string>) => {
          const qs = new URLSearchParams(params).toString();
          return new Response(null, { status: 302, headers: { Location: `${origin}/my-calendar?${qs}` } });
        };
        const fail = (msg: string) => back({ calendar: "error", msg });
        const ok = () => back({ calendar: "success" });

        if (errParam) return fail(errParam);
        if (!code || !state) return fail("Parâmetros ausentes");
        const payload = verifyState(state);
        if (!payload) return fail("State inválido ou expirado");
        const userId = payload.user_id as string;
        const orgId = payload.organization_id as string;
        const provider = payload.provider as "google" | "microsoft";

        try {
          let tok: { access_token: string; refresh_token?: string; expires_in: number; email?: string };
          if (provider === "google") {
            const cid = process.env.GOOGLE_OAUTH_CLIENT_ID;
            const cs = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
            if (!cid || !cs) return fail("Integração Google indisponível");
            tok = await exchangeGoogleCode({
              code, redirectUri,
              clientId: cid, clientSecret: cs,
            });
          } else {
            const cid = process.env.MS_OAUTH_CLIENT_ID;
            const cs = process.env.MS_OAUTH_CLIENT_SECRET;
            if (!cid || !cs) return fail("Integração Microsoft indisponível");
            tok = await exchangeMicrosoftCode({
              code, redirectUri,
              clientId: cid, clientSecret: cs,
              tenant: process.env.MS_OAUTH_TENANT ?? "common",
            });
          }
          const expires_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();
          const { error } = await supabaseAdmin.from("calendar_connections").upsert({
            user_id: userId,
            organization_id: orgId,
            provider,
            email: tok.email ?? null,
            access_token: tok.access_token,
            refresh_token: tok.refresh_token ?? null,
            expires_at,
            enabled: true,
          } as never, { onConflict: "user_id,provider" });
          if (error) return fail(error.message);
          return ok();
        } catch (e) {
          return fail((e as Error).message);
        }
      },
    },
  },
});