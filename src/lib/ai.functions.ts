import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, generateObject, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createOpenAiCompatibleProvider, getAiApiKey } from "@/lib/ai-gateway";
import {
  systemPrompt,
  outreachPrompt,
  INTENT_SYSTEM,
  type OutreachChannel,
} from "@/lib/prompts";

const INTENTS = ["interessado", "pediu_info", "objecao", "desinteresse", "agendar"] as const;
export type Intent = (typeof INTENTS)[number];

const previewSchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(["whatsapp", "email"]),
  cadenceDay: z.number().int().min(1).max(30).default(1),
});

async function loadCtx(supabase: any, leadId: string) {
  const { data: lead, error: e1 } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (e1) throw new Error(e1.message);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings, error: e2 } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .eq("organization_id", lead.organization_id)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!settings) throw new Error("Configurações da empresa não encontradas.");
  return { lead, settings };
}

export const previewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof previewSchema>) => previewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = getAiApiKey();
    const { lead, settings } = await loadCtx(context.supabase, data.leadId);
    const gateway = createOpenAiCompatibleProvider(key);
    const model = gateway(settings.llm_model || "google/gemini-3-flash-preview");
    const channel = data.channel as OutreachChannel;

    if (channel === "email") {
      const { output } = await generateText({
        model,
        system: systemPrompt(settings, channel),
        prompt: outreachPrompt(lead, channel, data.cadenceDay),
        output: Output.object({
          schema: z.object({ subject: z.string(), body: z.string() }),
        }),
      });
      return { subject: output.subject, body: output.body };
    }
    const { text } = await generateText({
      model,
      system: systemPrompt(settings, channel),
      prompt: outreachPrompt(lead, channel, data.cadenceDay),
    });
    return { subject: null, body: text.trim() };
  });

const intentSchema = z.object({ text: z.string().min(1).max(5000) });

export const classifyIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof intentSchema>) => intentSchema.parse(d))
  .handler(async ({ data }): Promise<{ intent: Intent }> => {
    const key = getAiApiKey();
    const gateway = createOpenAiCompatibleProvider(key);
    const model = gateway("google/gemini-3-flash-preview");
    const { object } = await generateObject({
      model,
      system: INTENT_SYSTEM,
      prompt: `Resposta do lead:\n"""${data.text}"""`,
      schema: z.object({ intent: z.enum(INTENTS) }),
    });
    return { intent: object.intent };
  });
