export function nextFallback(providers: string[], tried: Set<string>): string | null {
  for (const p of providers) if (!tried.has(p)) return p;
  return null;
}