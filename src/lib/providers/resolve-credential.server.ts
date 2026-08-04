// Central credential resolver. Server-only.
// Order: (1) organization own, (2) platform (if plan allows), (3) legacy env, (4) unavailable.

import { openSecret } from "./vault.server";

export type CredentialSource = "organization" | "platform" | "legacy_env" | "unavailable";

export interface ResolvedCredential {
  source: CredentialSource;
  apiKey?: string;
  baseUrl?: string;
  provider: string;
}

const LEGACY_ENV_MAP: Record<string, { keyEnv: string; baseUrlDefault?: string }> = {
  casa_dos_dados: { keyEnv: "CASA_DOS_DADOS_API_KEY", baseUrlDefault: "https://api.casadosdados.com.br/v5" },
  kipflow: { keyEnv: "KIPFLOW_API_KEY", baseUrlDefault: "https://api.kipflow.com" },
  apify: { keyEnv: "APIFY_API_TOKEN", baseUrlDefault: "https://api.apify.com/v2" },
};

export async function resolveProviderCredential(
  orgId: string | null | undefined,
  provider: string,
): Promise<ResolvedCredential> {
  if (orgId) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("tenant_provider_settings_enabled")
        .eq("organization_id", orgId)
        .maybeSingle();

      if ((settings as any)?.tenant_provider_settings_enabled) {
        const { data: cred } = await supabaseAdmin
          .from("provider_credentials")
          .select("credential_mode, enabled, base_url, encrypted_secret_reference")
          .eq("organization_id", orgId)
          .eq("provider", provider)
          .eq("enabled", true)
          .maybeSingle();

        if (cred && (cred as any).credential_mode === "organization" && (cred as any).encrypted_secret_reference) {
          const { data: vaultRow } = await supabaseAdmin
            .from("provider_secret_vault")
            .select("ciphertext, iv, auth_tag")
            .eq("reference", (cred as any).encrypted_secret_reference)
            .maybeSingle();
          if (vaultRow) {
            const toBuf = (v: unknown): Buffer => {
              if (Buffer.isBuffer(v)) return v;
              if (typeof v === "string") {
                // Postgres bytea returns as \x hex string
                return v.startsWith("\\x")
                  ? Buffer.from(v.slice(2), "hex")
                  : Buffer.from(v, "base64");
              }
              return Buffer.from(v as ArrayBuffer);
            };
            const apiKey = openSecret({
              ciphertext: toBuf((vaultRow as any).ciphertext),
              iv: toBuf((vaultRow as any).iv),
              authTag: toBuf((vaultRow as any).auth_tag),
            });
            return {
              source: "organization",
              apiKey,
              baseUrl: (cred as any).base_url ?? LEGACY_ENV_MAP[provider]?.baseUrlDefault,
              provider,
            };
          }
        }
      }
    } catch {
      // fall through to legacy
    }
  }

  const legacy = LEGACY_ENV_MAP[provider];
  if (legacy) {
    const envKey = process.env[legacy.keyEnv];
    if (envKey) {
      return {
        source: "legacy_env",
        apiKey: envKey,
        baseUrl: legacy.baseUrlDefault,
        provider,
      };
    }
  }

  return { source: "unavailable", provider };
}