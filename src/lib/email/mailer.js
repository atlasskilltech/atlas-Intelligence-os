import "server-only";
import nodemailer from "nodemailer";
import { getMailConfig } from "../config/env.js";

/**
 * Sends one email through the configured SMTP mailbox (Google Workspace by default).
 * The transport is created once per process and reused.
 */
let cached = null; // { key, transport }

function transport(cfg) {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure, // 465 = TLS from the start; 587 upgrades with STARTTLS
        requireTLS: !cfg.secure,
        auth: { user: cfg.user, pass: cfg.password },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return cached.transport;
}

export const isMailConfigured = () => Boolean(getMailConfig());

/** { to, subject, html, text } → { messageId }. Throws a plain-language error. */
export async function sendMail({ to, subject, html, text }) {
  const cfg = getMailConfig();
  if (!cfg) throw new Error("Email is not set up on this server (SMTP_USER and SMTP_PASSWORD).");
  try {
    const info = await transport(cfg).sendMail({ from: { name: cfg.fromName, address: cfg.from }, to, subject, html, text });
    return { messageId: info.messageId };
  } catch (err) {
    const code = err?.responseCode;
    if (code === 535 || /invalid login|username and password/i.test(err?.message || "")) {
      throw new Error("The email server rejected the login. Check SMTP_USER and the App Password in SMTP_PASSWORD.");
    }
    throw new Error(`Email could not be sent: ${err?.message || "unknown error"}`);
  }
}

/** For the Connectors page: never shows the password. */
export function mailStatus() {
  const cfg = getMailConfig();
  return cfg
    ? { ready: true, message: `Sends from ${cfg.from} via ${cfg.host}` }
    : { ready: false, message: "Not set up: add SMTP_USER and SMTP_PASSWORD (a Google Workspace App Password) to the server .env" };
}
