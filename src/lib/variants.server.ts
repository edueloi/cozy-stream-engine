import type { SupabaseClient } from "@supabase/supabase-js";

export type PickedVariant = {
  variant_key: string;
  subject: string | null;
  body_template: string;
};

export async function pickVariant(
  supabase: SupabaseClient,
  day: number,
  channel: "whatsapp" | "email",
  cadenceId?: string | null,
): Promise<PickedVariant | null> {
  let q = supabase
    .from("cadence_variants")
    .select("variant_key, subject, body_template, weight")
    .eq("cadence_day", day)
    .eq("channel", channel)
    .eq("active", true);
  if (cadenceId) q = q.eq("cadence_id", cadenceId);
  const { data } = await q;
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, v) => s + (v.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const v of data) {
    r -= v.weight ?? 1;
    if (r <= 0) return { variant_key: v.variant_key, subject: v.subject, body_template: v.body_template };
  }
  return data[0];
}

export function renderTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, k) => (vars[k] ?? "").toString());
}