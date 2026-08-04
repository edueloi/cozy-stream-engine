import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logSchema = z.object({
  leadId: z.string().uuid(),
  toNumber: z.string().optional(),
  fromNumber: z.string().optional(),
  status: z.enum(["ringing", "answered", "ended", "failed", "no_answer", "busy", "canceled"]),
  durationSec: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  callId: z.string().uuid().optional(),
});

export const logCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof logSchema>) => logSchema.parse(input))
  .handler(async ({ data, context }) => {
    const base = {
      lead_id: data.leadId,
      to_number: data.toNumber ?? null,
      from_number: data.fromNumber ?? null,
      status: data.status,
      duration_sec: data.durationSec ?? null,
      notes: data.notes ?? null,
      direction: "outbound",
      ended_at: ["ended", "failed", "no_answer", "busy", "canceled"].includes(data.status)
        ? new Date().toISOString()
        : null,
    };
    if (data.callId) {
      const { error } = await context.supabase
        .from("calls")
        .update(base as never)
        .eq("id", data.callId);
      if (error) throw new Error(error.message);
      await context.supabase.from("activity_events").insert({
        lead_id: data.leadId,
        kind: "call_update",
        payload: { status: data.status, durationSec: data.durationSec ?? null } as never,
      } as never);
      return { id: data.callId };
    }
    const { data: inserted, error } = await context.supabase
      .from("calls")
      .insert(base as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("activity_events").insert({
      lead_id: data.leadId,
      kind: "call_start",
      payload: { to: data.toNumber, status: data.status } as never,
    } as never);
    return { id: (inserted as { id: string }).id };
  });