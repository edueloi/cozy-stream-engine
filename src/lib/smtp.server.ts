interface SmtpCfg {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string | null;
  useSsl?: boolean;
  useTls?: boolean;
  authEnabled?: boolean;
}

export async function sendEmail(cfg: SmtpCfg, to: string, subject: string, body: string) {
  const useSsl = cfg.useSsl ?? cfg.port === 465;
  const useTls = cfg.useTls ?? !useSsl;
  const authEnabled = cfg.authEnabled ?? true;
  const { WorkerMailer } = await import("worker-mailer");
  const mailer = await WorkerMailer.connect({
    host: cfg.host,
    port: cfg.port,
    secure: useSsl,
    startTls: useTls && !useSsl,
    credentials: authEnabled ? { username: cfg.user, password: cfg.pass } : undefined,
    authType: authEnabled ? ["plain", "login"] : undefined,
  });
  try {
    await mailer.send({
      from: cfg.fromName ? { name: cfg.fromName, email: cfg.fromEmail } : { email: cfg.fromEmail },
      to,
      subject,
      text: body,
    });
  } finally {
    try {
      await mailer.close?.();
    } catch {
      // ignore
    }
  }
  return { externalId: null, raw: { accepted: [to], rejected: [] } };
}

export type { SmtpCfg };