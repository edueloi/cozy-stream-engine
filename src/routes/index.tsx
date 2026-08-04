import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getCurrentUser } from "@/lib/local-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JCS SDR — Plataforma de Prospecção com IA" },
      {
        name: "description",
        content:
          "Prospecção outbound automatizada: leads, scoring, cadência multicanal (email, WhatsApp, voz) com agente IA.",
      },
      { property: "og:title", content: "JCS SDR — Plataforma de Prospecção com IA" },
      {
        property: "og:description",
        content: "Cadência automatizada multicanal com IA para gerar reuniões qualificadas.",
      },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    if (!cancelled) navigate({ to: getCurrentUser() ? "/dashboard" : "/auth", replace: true });
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Carregando...
    </div>
  );
}
