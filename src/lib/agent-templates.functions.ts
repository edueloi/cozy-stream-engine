import { createServerFn } from "@tanstack/react-start";
import { requireLocalAuth } from "@/lib/local-auth-middleware";

export const listAgentTemplates = createServerFn({ method: "GET" }).middleware([requireLocalAuth]).handler(async () => ({ items: [] }));
export const createAgentFromTemplate = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).handler(async () => { throw new Error("Os templates serão cadastrados no MySQL local em breve."); });
