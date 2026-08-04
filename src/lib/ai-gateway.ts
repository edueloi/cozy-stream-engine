import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function getAiBaseUrl() {
  if (process.env.AI_PROVIDER === "gemini") {
    return "https://generativelanguage.googleapis.com/v1beta/openai";
  }
  return (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

export function getAiApiKey() {
  const key = process.env.AI_PROVIDER === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(process.env.AI_PROVIDER === "gemini" ? "GEMINI_API_KEY ausente" : "OPENAI_API_KEY ausente");
  }
  return key;
}

export function createOpenAiCompatibleProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openai-compatible",
    baseURL: getAiBaseUrl(),
    apiKey,
  });
}
