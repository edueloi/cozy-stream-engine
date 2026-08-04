import { emptyCompany, type NormalizedCompany, type NormalizedDecisionMaker } from "../normalizer";

export function mergeCompany(
  base: NormalizedCompany | null,
  patch: Partial<NormalizedCompany> | null,
  source = "merge",
): NormalizedCompany {
  const b = base ?? emptyCompany(source);
  if (!patch) return b;
  const out: NormalizedCompany = { ...b };
  for (const k of Object.keys(patch) as Array<keyof NormalizedCompany>) {
    const v = (patch as any)[k];
    if (v == null || v === "") continue;
    if (k === "decision_makers") {
      out.decision_makers = dedupePeople([...(b.decision_makers ?? []), ...(v as NormalizedDecisionMaker[])]);
      continue;
    }
    if (k === "contacts") {
      const merged = [...(b.contacts ?? []), ...(v as any[])];
      const seen = new Set<string>();
      out.contacts = merged.filter((c) => {
        const key = `${c.kind}:${c.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      continue;
    }
    if ((out as any)[k] == null || (out as any)[k] === "") (out as any)[k] = v;
  }
  return out;
}

function dedupePeople(list: NormalizedDecisionMaker[]): NormalizedDecisionMaker[] {
  const seen = new Map<string, NormalizedDecisionMaker>();
  for (const p of list) {
    const key = (p.linkedin || p.email || p.name || "").toLowerCase().trim();
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || (p.confidence ?? 0) > (prev.confidence ?? 0)) seen.set(key, p);
  }
  return Array.from(seen.values());
}

export function contactConfidence(c: NormalizedCompany): number {
  let score = 0;
  if (c.email) score += 35;
  if (c.phone) score += 30;
  if (c.linkedin) score += 15;
  if (c.decision_makers?.length) score += 20;
  return Math.min(100, score);
}