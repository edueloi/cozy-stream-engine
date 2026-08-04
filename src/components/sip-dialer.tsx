import { useEffect, useState } from "react";
import { useSip } from "@/lib/sip-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, PhoneOff, Mic, MicOff, Wifi, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SipDialer() {
  const { regStatus, regError, currentCall, muted, hangup, toggleMute, sendDTMF } = useSip();
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(true);
  const [showKeypad, setShowKeypad] = useState(false);

  useEffect(() => {
    if (currentCall?.status === "in_call" && currentCall.answeredAt) {
      const tick = () => setElapsed(Math.round((Date.now() - currentCall.answeredAt!) / 1000));
      tick();
      const t = setInterval(tick, 1000);
      return () => clearInterval(t);
    }
    setElapsed(0);
  }, [currentCall?.status, currentCall?.answeredAt]);

  // If unconfigured AND no call → hide entirely
  if (regStatus === "unconfigured" && !currentCall) return null;

  if (!open && !currentCall) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-background border shadow-lg p-2"
        aria-label="Status SIP"
      >
        {regStatus === "registered" ? (
          <Wifi className="h-4 w-4 text-emerald-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-72 shadow-2xl border-2">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2 text-xs">
          {regStatus === "registered" ? (
            <span className="flex items-center gap-1 text-emerald-600">
              <Wifi className="h-3 w-3" /> Online
            </span>
          ) : regStatus === "connecting" ? (
            <span className="text-amber-600">Conectando…</span>
          ) : regStatus === "failed" ? (
            <span className="text-destructive" title={regError ?? ""}>Falha</span>
          ) : (
            <span className="text-muted-foreground">Offline</span>
          )}
        </div>
        {!currentCall && (
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {currentCall ? (
        <div className="p-4 space-y-3">
          <div className="text-center">
            <div className="text-xs uppercase text-muted-foreground">
              {currentCall.status === "calling" && "Chamando…"}
              {currentCall.status === "ringing" && "Tocando…"}
              {currentCall.status === "in_call" && fmt(elapsed)}
              {currentCall.status === "ended" && "Encerrada"}
              {currentCall.status === "failed" && "Falhou"}
            </div>
            <div className="font-mono text-base mt-0.5">{currentCall.number}</div>
          </div>

          {showKeypad && currentCall.status === "in_call" && (
            <div className="grid grid-cols-3 gap-1.5">
              {["1","2","3","4","5","6","7","8","9","*","0","#"].map((d) => (
                <button
                  key={d}
                  onClick={() => sendDTMF(d)}
                  className="rounded border bg-muted/40 hover:bg-muted py-2 text-sm font-mono"
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={toggleMute}
              disabled={currentCall.status !== "in_call"}
              className={cn(muted && "bg-amber-100 dark:bg-amber-950")}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowKeypad((v) => !v)}
              disabled={currentCall.status !== "in_call"}
            >
              #
            </Button>
            <Button size="sm" variant="destructive" onClick={hangup}>
              <PhoneOff className="h-4 w-4 mr-1" /> Encerrar
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 text-xs text-muted-foreground">
          {regStatus === "registered"
            ? "Pronto para ligar. Use o botão Ligar no lead."
            : regStatus === "failed"
              ? regError ?? "Verifique as credenciais SIP em Configurações."
              : "Aguardando registro SIP…"}
        </div>
      )}
    </Card>
  );
}

export function CallLeadButton({
  leadId,
  number,
  label = "Ligar",
}: {
  leadId: string;
  number: string | null | undefined;
  label?: string;
}) {
  const { call, regStatus, currentCall } = useSip();
  const disabled =
    !number || regStatus !== "registered" || (!!currentCall && currentCall.status !== "ended" && currentCall.status !== "failed");

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={async () => {
        if (!number) return;
        try {
          await call(number, leadId);
        } catch (e) {
          const { toast } = await import("sonner");
          toast.error((e as Error).message);
        }
      }}
    >
      <Phone className="h-4 w-4 mr-1" /> {label}
    </Button>
  );
}