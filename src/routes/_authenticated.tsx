import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SipProvider } from "@/lib/sip-provider";
import { getCurrentUser } from "@/lib/local-auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(() => {
    if (typeof window === "undefined") return true;
    return !!getCurrentUser();
  });

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      navigate({ to: "/auth", replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <SipProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </SipProvider>
  );
}
