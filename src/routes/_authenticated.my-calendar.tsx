import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { CalendarSettingsCard } from "@/components/calendar-settings-card";
import { CalendarMirror } from "@/components/calendar-mirror";
import { EmailSettingsCard } from "@/components/email-settings-card";
import { CalendarDashboardSummary } from "@/components/calendar-dashboard-summary";

export const Route = createFileRoute("/_authenticated/my-calendar")({
  head: () => ({ meta: [{ title: "Minha Agenda — JCS SDR" }] }),
  component: MyCalendarPage,
});

function MyCalendarPage() {
  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Minha Agenda"
        description="Conecte sua agenda pessoal (Google ou Microsoft 365). Depois de conectada, você vê um espelho dos seus compromissos e o agente pode criar/cancelar reuniões."
      />
      <CalendarDashboardSummary />
      <CalendarSettingsCard />
      <EmailSettingsCard />
      <CalendarMirror />
    </div>
  );
}