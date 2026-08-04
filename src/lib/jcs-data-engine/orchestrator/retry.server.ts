import { classifyError, maxAttemptsFor, type ClassifiedError } from "./error-classifier";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onAttempt?: (attempt: number, error?: Error, classified?: ClassifiedError) => void;
  sleep?: (ms: number) => Promise<void>;
}

export type RetryOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: Error; attempts: number; classified: ClassifiedError };

/**
 * Executa `fn` com retry sensível à categoria do erro.
 * - retryable → até `attempts` (default 3), respeita Retry-After.
 * - unknown   → até 2 tentativas.
 * - terminal  → 1 tentativa, sem repetição.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<RetryOutcome<T>> {
  const base = opts.baseDelayMs ?? 250;
  const max = opts.maxDelayMs ?? 4000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const configuredMax = opts.attempts;

  let lastErr: Error = new Error("unknown");
  let lastClass: ClassifiedError = { category: "unknown", reason: "unknown_error" };
  let attempt = 0;
  const hardCap = configuredMax ?? 3;

  while (attempt < hardCap) {
    attempt++;
    try {
      opts.onAttempt?.(attempt);
      const value = await fn();
      return { ok: true, value, attempts: attempt };
    } catch (e) {
      lastErr = e as Error;
      lastClass = classifyError(e);
      opts.onAttempt?.(attempt, lastErr, lastClass);

      const catMax = maxAttemptsFor(lastClass.category);
      const effectiveMax = Math.min(configuredMax ?? catMax, catMax);
      if (attempt >= effectiveMax) break;

      const backoff = Math.min(max, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 100);
      const delay = lastClass.retry_after_ms != null
        ? Math.max(lastClass.retry_after_ms, backoff)
        : backoff;
      await sleep(delay);
    }
  }
  return { ok: false, error: lastErr, attempts: attempt, classified: lastClass };
}