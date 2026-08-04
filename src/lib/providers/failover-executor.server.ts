// Executor com failover automático.
// Percorre candidatos elegíveis, classifica erros, tenta próximo quando cabível.
// Nunca vaza segredos em log. Preserva cadeia completa em fallback_chain.

import { classifyProviderError, sanitizeForLog } from "./failover-classifier";
import {
  selectProviders,
  diagnoseProviders,
  type Capability,
  type CandidateProvider,
} from "./failover-registry.server";
import { logProviderUsage } from "./runtime-config.server";

export interface FailoverAttempt {
  provider: string;
  ok: boolean;
  durationMs: number;
  category?: string;
  reason?: string;
}

export interface FailoverResult<T> {
  ok: boolean;
  data: T | null;
  provider: string | null;
  chain: FailoverAttempt[];
  reasonByProvider: Record<string, string>;
}

export interface FailoverExec<T> {
  organizationId: string;
  capability: Capability;
  operation: string;
  mode?: "auto" | "manual";
  pinned?: string | null;
  prospectingResultId?: string | null;
  prospectingSearchId?: string | null;
  exec: (candidate: CandidateProvider) => Promise<T | null>;
  treatEmptyAsFailure?: boolean;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export async function runWithFailover<T>(input: FailoverExec<T>): Promise<FailoverResult<T>> {
  const candidates = await selectProviders({
    organizationId: input.organizationId,
    capability: input.capability,
    mode: input.mode ?? "auto",
    pinned: input.pinned ?? null,
  });

  const chain: FailoverAttempt[] = [];
  const reasonByProvider: Record<string, string> = {};

  if (candidates.length === 0) {
    const diag = await diagnoseProviders({
      organizationId: input.organizationId,
      capability: input.capability,
    });
    for (const d of diag) reasonByProvider[d.provider] = d.skipReason ?? "unknown";
    return { ok: false, data: null, provider: null, chain, reasonByProvider };
  }

  for (const cand of candidates) {
    const started = Date.now();
    try {
      const data = await input.exec(cand);
      const duration = Date.now() - started;

      if (data != null && !(input.treatEmptyAsFailure && isEmpty(data))) {
        chain.push({ provider: cand.provider, ok: true, durationMs: duration });
        await logProviderUsage({
          organizationId: input.organizationId,
          provider: cand.provider,
          operation: input.operation,
          credentialSource: cand.config.credentialSource,
          success: true,
          durationMs: duration,
          prospectingResultId: input.prospectingResultId ?? null,
          prospectingSearchId: input.prospectingSearchId ?? null,
          metadata: {
            fallback_chain: chain.map((c) => c.provider),
            attempts: chain.length,
            capability: input.capability,
          },
        });
        return { ok: true, data, provider: cand.provider, chain, reasonByProvider };
      }

      chain.push({
        provider: cand.provider,
        ok: false,
        durationMs: duration,
        category: "empty_result",
        reason: "empty_result",
      });
      reasonByProvider[cand.provider] = "empty_result";
      await logProviderUsage({
        organizationId: input.organizationId,
        provider: cand.provider,
        operation: input.operation,
        credentialSource: cand.config.credentialSource,
        success: false,
        durationMs: duration,
        errorCode: "empty_result",
        prospectingResultId: input.prospectingResultId ?? null,
        prospectingSearchId: input.prospectingSearchId ?? null,
        metadata: {
          fallback_chain: chain.map((c) => c.provider),
          capability: input.capability,
          reason: "empty_result",
        },
      });
      continue;
    } catch (err) {
      const duration = Date.now() - started;
      const status =
        (err as any)?.status ??
        (err as any)?.statusCode ??
        (err as any)?.response?.status ??
        null;
      const decision = classifyProviderError(err, status);

      chain.push({
        provider: cand.provider,
        ok: false,
        durationMs: duration,
        category: decision.category,
        reason: decision.reason,
      });
      reasonByProvider[cand.provider] = decision.reason;

      await logProviderUsage({
        organizationId: input.organizationId,
        provider: cand.provider,
        operation: input.operation,
        credentialSource: cand.config.credentialSource,
        success: false,
        durationMs: duration,
        errorCode: decision.category,
        prospectingResultId: input.prospectingResultId ?? null,
        prospectingSearchId: input.prospectingSearchId ?? null,
        metadata: sanitizeForLog({
          fallback_chain: chain.map((c) => c.provider),
          capability: input.capability,
          reason: decision.reason,
        }) as Record<string, unknown>,
      });

      if (!decision.failover) {
        // erro de usuário — não faz failover
        return { ok: false, data: null, provider: null, chain, reasonByProvider };
      }
    }
  }

  return { ok: false, data: null, provider: null, chain, reasonByProvider };
}

export function friendlyFailoverMessage(): string {
  return "Nenhum provedor disponível para essa busca. Peça ao administrador para revisar as integrações.";
}

export function adminFailoverBreakdown(
  result: FailoverResult<unknown>,
): Array<{ provider: string; reason: string }> {
  return Object.entries(result.reasonByProvider).map(([provider, reason]) => ({ provider, reason }));
}