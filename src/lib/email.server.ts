// Email OAuth helpers (Gmail / Microsoft Graph send-mail).
// Reuses the calendar token exchange functions but with email-only scopes.

export const GOOGLE_EMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export const MS_EMAIL_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Mail.Send",
].join(" ");

export function googleEmailAuthUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("scope", GOOGLE_EMAIL_SCOPES);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

export function microsoftEmailAuthUrl(opts: { clientId: string; tenant?: string; redirectUri: string; state: string }) {
  const tenant = opts.tenant || "common";
  const authority = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const u = new URL(authority);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", MS_EMAIL_SCOPES);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("prompt", "select_account");
  console.log("[ms-oauth:email] authority=%s tenant=%s prompt=select_account scopes=%s", authority, tenant, MS_EMAIL_SCOPES);
  return u.toString();
}

type TokenResp = { access_token: string; refresh_token?: string; expires_in: number; scope?: string; email?: string };

export async function exchangeGoogleEmailCode(opts: { code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<TokenResp> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const json = (await res.json()) as TokenResp & { id_token?: string };
  if (!res.ok) throw new Error(`Google email token exchange: ${JSON.stringify(json)}`);
  let email: string | undefined;
  try {
    if (json.id_token) {
      const payload = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64").toString("utf8"));
      email = payload.email;
    }
  } catch { /* ignore */ }
  if (!email) {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${json.access_token}` } });
    if (r.ok) email = ((await r.json()) as { email?: string }).email;
  }
  return { ...json, email };
}

export async function exchangeMicrosoftEmailCode(opts: { code: string; clientId: string; clientSecret: string; redirectUri: string; tenant?: string }): Promise<TokenResp> {
  const tenant = opts.tenant || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      scope: MS_EMAIL_SCOPES,
    }).toString(),
  });
  const json = (await res.json()) as TokenResp & { id_token?: string };
  if (!res.ok) {
    const j = json as unknown as { error?: string; error_codes?: number[]; error_description?: string };
    console.error("[ms-oauth:email] exchange failed tenant=%s error=%s codes=%s desc=%s", tenant, j.error, JSON.stringify(j.error_codes), j.error_description);
    throw new Error(`Microsoft email token exchange: ${j.error ?? "unknown"} ${JSON.stringify(j.error_codes ?? [])}`);
  }
  let email: string | undefined;
  try {
    if (json.id_token) {
      const payload = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64").toString("utf8"));
      email = payload.email || payload.preferred_username;
      const tid = (payload as { tid?: string }).tid;
      if (tid) console.log("[ms-oauth:email] token tenant tid=%s", tid);
    }
  } catch { /* ignore */ }
  return { ...json, email };
}

export async function refreshGoogleEmailToken(opts: { refreshToken: string; clientId: string; clientSecret: string }): Promise<TokenResp> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const json = (await res.json()) as TokenResp;
  if (!res.ok) throw new Error(`Google email refresh: ${JSON.stringify(json)}`);
  return json;
}

export async function refreshMicrosoftEmailToken(opts: { refreshToken: string; clientId: string; clientSecret: string; tenant?: string }): Promise<TokenResp> {
  const tenant = opts.tenant || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
      scope: MS_EMAIL_SCOPES,
    }).toString(),
  });
  const json = (await res.json()) as TokenResp;
  if (!res.ok) throw new Error(`Microsoft email refresh: ${JSON.stringify(json)}`);
  return json;
}

// ---- Send mail ----

function b64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function gmailSend(opts: { accessToken: string; from: string; to: string; subject: string; html?: string; text?: string }) {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    opts.html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.html ?? opts.text ?? "",
  ];
  const raw = b64url(lines.join("\r\n"));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gmail send: ${res.status} ${t}`);
  }
  return (await res.json()) as { id?: string };
}

export async function microsoftSend(opts: { accessToken: string; to: string; subject: string; html?: string; text?: string }) {
  const message = {
    message: {
      subject: opts.subject,
      body: { contentType: opts.html ? "HTML" : "Text", content: opts.html ?? opts.text ?? "" },
      toRecipients: [{ emailAddress: { address: opts.to } }],
    },
    saveToSentItems: true,
  };
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok && res.status !== 202) {
    const t = await res.text().catch(() => "");
    throw new Error(`Microsoft sendMail: ${res.status} ${t}`);
  }
  return { ok: true };
}

// ---- Per-user email connection resolver (mirrors calendar) ----

export async function getValidEmailConnectionForUser(supabaseAdmin: any, userId: string) {
  const { data: conn } = await supabaseAdmin
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn) return null;
  const expSoon = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 60_000;
  if (expSoon && conn.refresh_token) {
    try {
      let tok;
      if (conn.provider === "google") {
        tok = await refreshGoogleEmailToken({
          refreshToken: conn.refresh_token,
          clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        });
      } else {
        tok = await refreshMicrosoftEmailToken({
          refreshToken: conn.refresh_token,
          clientId: process.env.MS_OAUTH_CLIENT_ID!,
          clientSecret: process.env.MS_OAUTH_CLIENT_SECRET!,
          tenant: process.env.MS_OAUTH_TENANT ?? "common",
        });
      }
      const expires_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("email_connections")
        .update({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token ?? conn.refresh_token,
          expires_at,
        } as never)
        .eq("id", conn.id);
      conn.access_token = tok.access_token;
      conn.expires_at = expires_at;
    } catch {
      return null;
    }
  }
  return conn;
}

export async function resolveOwnerEmailConnection(
  supabaseAdmin: any,
  leadId: string,
  orgId: string,
  callerId?: string,
): Promise<{ ownerId: string; conn: any } | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("owner_id, agent_id, organization_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.organization_id !== orgId) return null;
  const candidates: string[] = [];
  if (lead.owner_id) candidates.push(lead.owner_id);
  if (lead.agent_id) {
    const { data: ag } = await supabaseAdmin
      .from("ai_agents")
      .select("default_calendar_user_id")
      .eq("id", lead.agent_id)
      .maybeSingle();
    if (ag?.default_calendar_user_id) candidates.push(ag.default_calendar_user_id);
  }
  if (callerId) candidates.push(callerId);
  const seen = new Set<string>();
  for (const cid of candidates) {
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const c = await getValidEmailConnectionForUser(supabaseAdmin, cid);
    if (c) return { ownerId: cid, conn: c };
  }
  return null;
}

export async function sendViaConnection(conn: {
  provider: string;
  access_token: string;
  email: string | null;
  sender_name?: string | null;
  signature?: string | null;
}, opts: { to: string; subject: string; body: string; isHtml?: boolean }) {
  const fromAddr = conn.sender_name && conn.email
    ? `${conn.sender_name} <${conn.email}>`
    : (conn.email ?? "");
  const bodyWithSig = conn.signature
    ? (opts.isHtml ? `${opts.body}<br/><br/>${conn.signature}` : `${opts.body}\n\n${conn.signature}`)
    : opts.body;
  if (conn.provider === "google") {
    const r = await gmailSend({
      accessToken: conn.access_token,
      from: fromAddr,
      to: opts.to,
      subject: opts.subject,
      ...(opts.isHtml ? { html: bodyWithSig } : { text: bodyWithSig }),
    });
    return { externalId: r.id ?? null, raw: r as unknown };
  }
  const r = await microsoftSend({
    accessToken: conn.access_token,
    to: opts.to,
    subject: opts.subject,
    ...(opts.isHtml ? { html: bodyWithSig } : { text: bodyWithSig }),
  });
  return { externalId: null, raw: r as unknown };
}