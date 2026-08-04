// Central normalization for a company's "Segmento" vs CNAE.
// Problem: providers/imports sometimes push a CNAE code (e.g. "6911701")
// into the `segment` field. Segmento is a commercial description; CNAE is
// the numeric code. This helper keeps them separate and derives a nice
// commercial label whenever we recognize the CNAE.
//
// Pure module (no I/O) — safe to import from server or client bundles.

import { CNAE_LIST } from "@/lib/cnae-list";

export interface NormalizeSegmentInput {
  segment?: string | null;
  cnae?: string | null;
  cnaeDescription?: string | null;
}

export interface NormalizedSegment {
  segment: string | null;
  cnae: string | null;
  cnaeDescription: string | null;
}

/** "6911-7/01" / "6911701" / "  6911701 " → "6911701" (7 digits) or null. */
function digitsOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  return d.length >= 5 && d.length <= 7 ? d.padStart(7, "0") : null;
}

/** True when the value looks like a CNAE code rather than a commercial name. */
export function looksLikeCnaeCode(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value).trim();
  if (!s) return false;
  // Accept "6911701", "6911-7/01", "69.11-7/01", etc. — anything that is
  // 90%+ digits and has no proper words is considered a CNAE code.
  const digits = s.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 7) return false;
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  return letters.length === 0;
}

const CNAE_BY_CODE = new Map<string, string>(
  CNAE_LIST.map((c) => [c.code, c.label] as const),
);

/** Lookup a commercial label for a CNAE code. */
export function labelForCnae(cnae: string | null | undefined): string | null {
  const code = digitsOnly(cnae);
  if (!code) return null;
  return CNAE_BY_CODE.get(code) ?? null;
}

/**
 * Normalize the {segment, cnae, cnaeDescription} triplet so the UI can
 * safely show `segment` without ever leaking a CNAE code into it.
 *
 * Rules:
 *  1. If `segment` is a CNAE code (numbers only) — discard it.
 *  2. If `cnae` is present and we know its label — use that as segment.
 *  3. Otherwise fall back to `cnaeDescription`.
 *  4. Never mutate the original CNAE code.
 */
export function normalizeCompanySegment(input: NormalizeSegmentInput): NormalizedSegment {
  const rawSegment = input.segment?.toString().trim() || null;
  const rawCnae = input.cnae?.toString().trim() || null;
  const rawCnaeDesc = input.cnaeDescription?.toString().trim() || null;

  // Preserve CNAE code as digits (7 digits when possible), fallback to raw.
  const cnae = digitsOnly(rawCnae) ?? rawCnae;

  // If segment carries a CNAE code, drop it — never expose codes as segment.
  const segmentCandidate = rawSegment && !looksLikeCnaeCode(rawSegment) ? rawSegment : null;

  // If cnaeDescription accidentally holds a code, drop it too.
  const cnaeDescription =
    rawCnaeDesc && !looksLikeCnaeCode(rawCnaeDesc) ? rawCnaeDesc : null;

  const derived =
    segmentCandidate ??
    labelForCnae(cnae) ??
    cnaeDescription ??
    null;

  return {
    segment: derived,
    cnae,
    cnaeDescription: cnaeDescription ?? labelForCnae(cnae),
  };
}