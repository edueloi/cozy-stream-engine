import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSipCredentials } from "@/lib/settings.functions";
import { logCall } from "@/lib/calls.functions";

type RegStatus = "unconfigured" | "disconnected" | "connecting" | "registered" | "failed";
type CallStatus = "idle" | "calling" | "ringing" | "in_call" | "ended" | "failed";

type CurrentCall = {
  number: string;
  leadId?: string;
  status: CallStatus;
  startedAt?: number;
  answeredAt?: number;
  endedAt?: number;
  callDbId?: string;
};

type JsSIPConstructor = new (configuration: Record<string, unknown>) => {
  on: (event: string, cb: (e?: { cause?: string }) => void) => void;
  start: () => void;
  stop: () => void;
};

type JsSIPModule = {
  UA?: JsSIPConstructor;
  WebSocketInterface?: new (url: string) => unknown;
};

type SipContextValue = {
  regStatus: RegStatus;
  regError: string | null;
  currentCall: CurrentCall | null;
  muted: boolean;
  call: (number: string, leadId?: string) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  sendDTMF: (digit: string) => void;
  reconnect: () => Promise<void>;
};

const SipContext = createContext<SipContextValue | null>(null);

function normalizeNumber(raw: string): string {
  return raw.replace(/[^0-9*#+]/g, "");
}

// Single-tab lock so the same SIP account is not registered from more than
// one tab/window in the same browser — duplicate registrations make most
// SIP providers drop the older binding and the UI flaps "registrado /
// desconectado".
const LOCK_KEY = "sip-active-tab";
const LOCK_TTL_MS = 8000;
const HEARTBEAT_MS = 3000;

function readLock(): { id: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { id: string; at: number };
  } catch {
    return null;
  }
}

async function loadJsSIP(): Promise<Required<JsSIPModule>> {
  const imported = (await import("jssip")) as unknown as { default?: JsSIPModule } & JsSIPModule;
  const JsSIP = imported.default ?? imported;
  if (typeof JsSIP.UA !== "function" || typeof JsSIP.WebSocketInterface !== "function") {
    throw new Error("Biblioteca SIP carregou sem os módulos necessários. Publique novamente a versão corrigida.");
  }
  return JsSIP as Required<JsSIPModule>;
}

export function SipProvider({ children }: { children: ReactNode }) {
  const fetchSipCreds = useServerFn(getSipCredentials);
  const logCallFn = useServerFn(logCall);
  const { data: settings } = useQuery({
    queryKey: ["sip-credentials"],
    queryFn: () => fetchSipCreds(),
    enabled: typeof window !== "undefined",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const uaRef = useRef<unknown>(null);
  const sessionRef = useRef<unknown>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callDbIdRef = useRef<string | undefined>(undefined);
  const activeConfigRef = useRef<string | null>(null);
  const tabIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  const [regStatus, setRegStatus] = useState<RegStatus>("unconfigured");
  const [regError, setRegError] = useState<string | null>(null);
  const [currentCall, setCurrentCall] = useState<CurrentCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [hasLock, setHasLock] = useState(false);

  const s = (settings ?? undefined) as Record<string, string | null | undefined> | undefined;
  const wsUrl = s?.sip_ws_url?.trim() ?? "";
  const username = s?.sip_username?.trim() ?? "";
  const password = s?.sip_password?.trim() ?? "";
  const domain = (s?.sip_domain?.trim() || s?.sip_server?.trim()) ?? "";
  const displayName = s?.sip_display_name?.trim() || username;

  // Acquire / maintain the single-tab lock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tabId = tabIdRef.current;
    const tryAcquire = () => {
      const cur = readLock();
      const now = Date.now();
      const stale = !cur || now - cur.at > LOCK_TTL_MS;
      if (!cur || cur.id === tabId || stale) {
        try {
          localStorage.setItem(LOCK_KEY, JSON.stringify({ id: tabId, at: now }));
          setHasLock(true);
          return;
        } catch {
          /* ignore */
        }
      }
      setHasLock(false);
    };
    tryAcquire();
    const beat = setInterval(tryAcquire, HEARTBEAT_MS);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_KEY) tryAcquire();
    };
    const release = () => {
      const cur = readLock();
      if (cur?.id === tabId) {
        try {
          localStorage.removeItem(LOCK_KEY);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", release);
    window.addEventListener("beforeunload", release);
    return () => {
      clearInterval(beat);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", release);
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, []);

  const startUA = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;
    if (!wsUrl || !username || !domain) {
      setRegStatus("unconfigured");
      activeConfigRef.current = null;
      return;
    }
    if (!hasLock) {
      // Another tab/window of this browser already owns the SIP session.
      setRegStatus("disconnected");
      setRegError("SIP ativo em outra aba deste navegador.");
      return;
    }

    const configKey = JSON.stringify([wsUrl, username, domain, displayName, Boolean(password)]);
    if (!force && uaRef.current && activeConfigRef.current === configKey) return;

    try {
      // Tear down any previous UA
      if (uaRef.current) {
        try {
          (uaRef.current as { stop: () => void }).stop();
        } catch {
          // ignore
        }
        uaRef.current = null;
        activeConfigRef.current = null;
      }
      setRegError(null);
      setRegStatus("connecting");

      const JsSIP = await loadJsSIP();
      const socket = new JsSIP.WebSocketInterface(wsUrl);
      const ua = new JsSIP.UA({
        sockets: [socket],
        uri: `sip:${username}@${domain}`,
        password: password || undefined,
        display_name: displayName,
        register: true,
        session_timers: false,
        register_expires: 120,
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 30,
      });

      ua.on("registered", () => {
        setRegStatus("registered");
        setRegError(null);
      });
      ua.on("unregistered", () => setRegStatus("disconnected"));
      ua.on("registrationFailed", (e?: { cause?: string }) => {
        setRegStatus("failed");
        setRegError(e?.cause ?? "Falha no registro SIP");
      });
      ua.on("disconnected", () => setRegStatus("disconnected"));

      ua.start();
      uaRef.current = ua;
      activeConfigRef.current = configKey;
    } catch (e) {
      setRegStatus("failed");
      activeConfigRef.current = null;
      const message = (e as Error).message;
      setRegError(
        message.includes("Class extends value undefined")
          ? "Falha ao carregar a biblioteca SIP no publicado. Publique novamente a versão corrigida."
          : message,
      );
    }
  }, [wsUrl, username, password, domain, displayName, hasLock]);

  // Auto-start UA when settings/lock change; also gracefully stop on unload.
  useEffect(() => {
    void startUA();
    const stop = () => {
      if (uaRef.current) {
        try {
          (uaRef.current as { stop: () => void }).stop();
        } catch {
          /* ignore */
        }
        uaRef.current = null;
        activeConfigRef.current = null;
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", stop);
      window.addEventListener("beforeunload", stop);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", stop);
        window.removeEventListener("beforeunload", stop);
      }
      stop();
    };
  }, [startUA]);

  // Ensure remote audio element exists
  useEffect(() => {
    if (typeof document === "undefined") return;
    let el = document.getElementById("sip-remote-audio") as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement("audio");
      el.id = "sip-remote-audio";
      el.autoplay = true;
      document.body.appendChild(el);
    }
    audioRef.current = el;
  }, []);

  const log = useCallback(
    async (status: Parameters<typeof logCallFn>[0]["data"]["status"], extra?: {
      durationSec?: number;
      leadId?: string;
      toNumber?: string;
      notes?: string;
    }) => {
      const leadId = extra?.leadId ?? currentCall?.leadId;
      if (!leadId) return; // we only persist calls tied to a lead
      try {
        const r = await logCallFn({
          data: {
            leadId,
            toNumber: extra?.toNumber ?? currentCall?.number,
            status,
            durationSec: extra?.durationSec,
            notes: extra?.notes,
            callId: callDbIdRef.current,
          },
        });
        if (!callDbIdRef.current) callDbIdRef.current = r.id;
      } catch {
        // best-effort logging
      }
    },
    [logCallFn, currentCall],
  );

  const hangup = useCallback(() => {
    const session = sessionRef.current as { terminate?: () => void } | null;
    if (session?.terminate) {
      try {
        session.terminate();
      } catch {
        // ignore
      }
    }
  }, []);

  const call = useCallback(
    async (rawNumber: string, leadId?: string) => {
      const ua = uaRef.current as
        | {
            isRegistered: () => boolean;
            call: (
              target: string,
              options: Record<string, unknown>,
            ) => unknown;
          }
        | null;
      if (!ua) throw new Error("SIP não configurado.");
      if (!ua.isRegistered()) throw new Error("SIP não registrado.");
      const number = normalizeNumber(rawNumber);
      if (!number) throw new Error("Número inválido.");
      const target = `sip:${number}@${domain}`;
      callDbIdRef.current = undefined;
      setMuted(false);
      setCurrentCall({ number, leadId, status: "calling", startedAt: Date.now() });
      void log("ringing", { leadId, toNumber: number });

      const session = ua.call(target, {
        mediaConstraints: { audio: true, video: false },
        rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
        pcConfig: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
      }) as {
        on: (event: string, cb: (e?: unknown) => void) => void;
        connection: RTCPeerConnection;
      };
      sessionRef.current = session;

      session.on("peerconnection", () => {
        const pc = session.connection;
        pc.addEventListener("track", (event) => {
          if (audioRef.current && event.streams[0]) {
            audioRef.current.srcObject = event.streams[0];
          }
        });
      });
      session.on("progress", () =>
        setCurrentCall((c) => (c ? { ...c, status: "ringing" } : c)),
      );
      session.on("accepted", () => {
        setCurrentCall((c) => (c ? { ...c, status: "in_call", answeredAt: Date.now() } : c));
        void log("answered", { leadId, toNumber: number });
      });
      session.on("failed", (e: unknown) => {
        const cause = (e as { cause?: string })?.cause ?? "failed";
        setCurrentCall((c) =>
          c ? { ...c, status: "failed", endedAt: Date.now() } : c,
        );
        void log(
          cause === "Busy" ? "busy" : cause === "Canceled" ? "canceled" : cause === "No Answer" ? "no_answer" : "failed",
          { leadId, toNumber: number, notes: cause },
        );
        sessionRef.current = null;
        setTimeout(() => setCurrentCall(null), 2500);
      });
      session.on("ended", () => {
        setCurrentCall((c) => {
          const dur =
            c?.answeredAt ? Math.round((Date.now() - c.answeredAt) / 1000) : 0;
          void log("ended", { leadId, toNumber: number, durationSec: dur });
          return c ? { ...c, status: "ended", endedAt: Date.now() } : c;
        });
        sessionRef.current = null;
        setTimeout(() => setCurrentCall(null), 2000);
      });
    },
    [domain, log],
  );

  const toggleMute = useCallback(() => {
    const session = sessionRef.current as
      | { mute: (o: { audio: boolean }) => void; unmute: (o: { audio: boolean }) => void }
      | null;
    if (!session) return;
    setMuted((m) => {
      if (m) session.unmute({ audio: true });
      else session.mute({ audio: true });
      return !m;
    });
  }, []);

  const sendDTMF = useCallback((digit: string) => {
    const session = sessionRef.current as
      | { sendDTMF: (d: string) => void }
      | null;
    if (session?.sendDTMF) session.sendDTMF(digit);
  }, []);

  const value = useMemo<SipContextValue>(
    () => ({
      regStatus,
      regError,
      currentCall,
      muted,
      call,
      hangup,
      toggleMute,
      sendDTMF,
      reconnect: () => startUA(true),
    }),
    [regStatus, regError, currentCall, muted, call, hangup, toggleMute, sendDTMF, startUA],
  );

  return <SipContext.Provider value={value}>{children}</SipContext.Provider>;
}

export function useSip() {
  const ctx = useContext(SipContext);
  if (!ctx) throw new Error("useSip must be used within SipProvider");
  return ctx;
}