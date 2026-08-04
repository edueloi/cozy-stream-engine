// Central phone resolution used by every WhatsApp / voice / handoff flow.
// Pure: no I/O, no DB — safe to import from any bundle (server or client).
//
// Public contract:
//   normalizeBrazilianPhone(raw): E.164-ish digits string (no "+"), or null
//   resolveLeadMessagingPhone({...}): picks whatsapp → telefone → none, with
//     dedup, source tracking and human-friendly reason.

export type MessagingSource = "whatsapp" | "phone" | "none";

export interface ResolvedMessagingPhone {
  rawValue: string | null;
  normalizedPhone: string | null;
  source: MessagingSource;
  isValid: boolean;
  /** Set only when an external verifier (Evolution onWhatsApp) confirms. */
  whatsappVerified: boolean | null;
  /** "phone_resolved_from_whatsapp" | "phone_resolved_from_phone" |
   *  "phone_invalid" | "missing_phone" | "phone_not_registered_on_whatsapp" |
   *  "phone_verification_failed" */
  verificationStatus: string;
  reason: string;
}

function stripFormatting(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Normalize a Brazilian (or international) phone number to a digits-only
 * representation compatible with WhatsApp (E.164 without the "+").
 *
 * Rules:
 * - Strip spaces, parenthesis, dashes, dots, "+".
 * - Preserve international numbers already prefixed (>= 12 digits, DDI kept).
 * - Brazilian landlines (10 digits: DDD + 8) get "55" prefix.
 * - Brazilian mobiles  (11 digits: DDD + 9 + 8) get "55" prefix.
 * - Never invent the ninth digit; never mutate valid numbers.
 * - Return null when nothing usable remains.
 */
export function normalizeBrazilianPhone(raw: string | null | undefined): string | null {
  const digits = stripFormatting(raw);
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Already carries a DDI or is fully-qualified — keep as-is.
  if (digits.length >= 12 && digits.length <= 15) return digits;
  // Too short / too long / unrecognizable → invalid.
  return null;
}

/** Quick validation: enough digits to be routable on WhatsApp/PSTN. */
export function isPlausiblePhone(normalized: string | null): boolean {
  if (!normalized) return false;
  return normalized.length >= 12 && normalized.length <= 15;
}

export interface ResolveInput {
  whatsapp?: string | null;
  phone?: string | null;
  /** Optional pre-verified WhatsApp state coming from a cache. */
  whatsappVerified?: boolean | null;
}

/**
 * Pick the number to use for a WhatsApp / voice interaction.
 * Priority: whatsapp → phone. Same value in both fields = single contact.
 */
export function resolveLeadMessagingPhone(input: ResolveInput): ResolvedMessagingPhone {
  const waRaw = input.whatsapp ?? null;
  const telRaw = input.phone ?? null;
  const waNorm = normalizeBrazilianPhone(waRaw);
  const telNorm = normalizeBrazilianPhone(telRaw);

  if (waNorm && isPlausiblePhone(waNorm)) {
    // If phone field carries the same normalized number, treat as single contact.
    return {
      rawValue: waRaw,
      normalizedPhone: waNorm,
      source: "whatsapp",
      isValid: true,
      whatsappVerified: input.whatsappVerified ?? null,
      verificationStatus: "phone_resolved_from_whatsapp",
      reason: "Usando WhatsApp cadastrado.",
    };
  }

  if (telNorm && isPlausiblePhone(telNorm)) {
    return {
      rawValue: telRaw,
      normalizedPhone: telNorm,
      source: "phone",
      isValid: true,
      whatsappVerified: input.whatsappVerified ?? null,
      verificationStatus: "phone_resolved_from_phone",
      reason: "O número do campo Telefone foi utilizado para o envio.",
    };
  }

  // Something was provided but did not normalize — flag as invalid.
  if (waRaw || telRaw) {
    return {
      rawValue: waRaw ?? telRaw ?? null,
      normalizedPhone: null,
      source: "none",
      isValid: false,
      whatsappVerified: null,
      verificationStatus: "phone_invalid",
      reason: "O número informado não parece válido.",
    };
  }

  return {
    rawValue: null,
    normalizedPhone: null,
    source: "none",
    isValid: false,
    whatsappVerified: null,
    verificationStatus: "missing_phone",
    reason: "Este lead não possui telefone ou WhatsApp válido.",
  };
}

/** Format for display (e.g. "15 99799-2929" from "5515997992929"). */
export function formatPhoneForDisplay(normalized: string | null | undefined): string {
  if (!normalized) return "";
  const d = String(normalized).replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return d;
}