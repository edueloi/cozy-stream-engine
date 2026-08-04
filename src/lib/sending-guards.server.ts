import { SupabaseClient } from "@supabase/supabase-js";

export const OPT_OUT_KEYWORDS = [
  "sair", "parar", "remover", "descadastrar", "cancelar inscrição",
  "não quero mais", "nao quero mais", "stop", "unsubscribe", "pare",
  "não envie", "nao envie", "deixe de enviar",
];

export function detectOptOut(text: string): boolean {
  const t = text.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some((k) => t === k || t.includes(k));
}

export type AntiBanSettings = {
  whatsapp_daily_limit: number;
  whatsapp_send_window_start: number;
  whatsapp_send_window_end: number;
  whatsapp_min_interval_seconds: number;
  send_days?: number[] | null;
};

type SendGuardOptions = {
  bypassSchedule?: boolean;
  skipMinInterval?: boolean;
};

function getSaoPauloDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: dayMap[weekday] ?? 0, hour };
}

/** Throws Error if a guard blocks the send. */
export async function assertCanSendWhatsApp(
  supabase: SupabaseClient,
  leadId: string,
  settings: AntiBanSettings,
  options: SendGuardOptions = {},
) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("opt_out, ai_paused")
    .eq("id", leadId)
    .single();
  if (error) throw new Error(error.message);
  if ((lead as { opt_out?: boolean }).opt_out) {
    throw new Error("Lead optou por não receber mensagens (opt-out).");
  }

  if (!options.bypassSchedule) {
    const { day, hour } = getSaoPauloDateParts();
    const days = settings.send_days ?? [1, 2, 3, 4, 5];
    if (days.length > 0 && !days.includes(day)) {
      throw new Error("Fora dos dias de envio configurados.");
    }
    if (
      hour < settings.whatsapp_send_window_start ||
      hour >= settings.whatsapp_send_window_end
    ) {
      throw new Error(
        `Fora da janela de envio (${settings.whatsapp_send_window_start}h–${settings.whatsapp_send_window_end}h).`,
      );
    }
  }

  // Daily limit
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "whatsapp")
    .eq("direction", "outbound")
    .gte("created_at", since.toISOString());
  if ((count ?? 0) >= settings.whatsapp_daily_limit) {
    throw new Error(
      `Limite diário de WhatsApp atingido (${settings.whatsapp_daily_limit}).`,
    );
  }

  // Minimum interval between sends
  if (options.skipMinInterval) return;
  const { data: last } = await supabase
    .from("messages")
    .select("created_at")
    .eq("channel", "whatsapp")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastAt = last?.[0]?.created_at as string | undefined;
  if (lastAt) {
    const diff = (Date.now() - new Date(lastAt).getTime()) / 1000;
    if (diff < settings.whatsapp_min_interval_seconds) {
      throw new Error(
        `Aguarde ${Math.ceil(settings.whatsapp_min_interval_seconds - diff)}s antes do próximo envio.`,
      );
    }
  }
}