import "server-only";
import nodemailer from "nodemailer";
import { getEmailConfig } from "../../config/env.js";
import { getSenderFor } from "../../email/senderSettings.js";
import { defineConnector } from "../defineConnector.js";
import { safeFetch } from "../http/safeFetch.js";

/**
 * Email connector (SMTP or SendGrid API). One action: email the agent's OWNER.
 * The recipient is never taken from the model's arguments — it is always
 * ctx.run.ownerEmail — so an agent cannot email anyone else.
 *
 * The "From" is the owner's own sender (Email sender page), else the default
 * (SENDGRID_FROM_EMAIL, else tech@atlasuniversity.edu.in).
 *
 * Env: SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS, or SENDGRID_API_KEY — see getEmailConfig().
 */

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const paras = (s) =>
  esc(s)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
// Subject lines must be one line (no header injection).
const oneLine = (s, n) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);

/** Report → { html, text } for the email body. */
export function renderReport(report) {
  const td = "border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top;font-size:13px";
  const html = [
    `<h2 style="margin:24px 0 8px;font-size:18px">${esc(report.title)}</h2>`,
    paras(report.summary),
    ...(report.sections || []).map((s) => `<h3 style="margin:16px 0 6px;font-size:15px">${esc(s.heading)}</h3>${paras(s.body)}`),
    ...(report.tables || []).map(
      (t) =>
        `${t.title ? `<h3 style="margin:16px 0 6px;font-size:15px">${esc(t.title)}</h3>` : ""}` +
        `<table style="border-collapse:collapse;margin:0 0 12px"><thead><tr>${t.columns.map((c) => `<th style="${td};background:#f3f4f6">${esc(c)}</th>`).join("")}</tr></thead>` +
        `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td style="${td}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
    ),
  ].join("");
  const text = [
    report.title,
    "",
    report.summary,
    ...(report.sections || []).flatMap((s) => ["", s.heading, s.body]),
    ...(report.tables || []).flatMap((t) => ["", t.title || "Table", t.columns.join(" | "), ...t.rows.map((r) => r.join(" | "))]),
  ].join("\n");
  return { html, text };
}

export function buildEmail({ subject, message, report, agentName }) {
  const rendered = report ? renderReport(report) : null;
  const footer = `Sent by your IntelligenceOS agent "${agentName || "Agent"}".`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;max-width:900px">` +
    paras(message) +
    (rendered ? rendered.html : "") +
    `<p style="margin:24px 0 0;color:#6b7280;font-size:12px">${esc(footer)}</p></div>`;
  const text = [message, rendered ? `\n${rendered.text}` : "", `\n—\n${footer}`].join("\n");
  return { subject: oneLine(subject, 200) || `Update from ${oneLine(agentName, 100) || "your agent"}`, html, text };
}

/** Sends one email with the configured provider. `from` = { email, name }. Throws a readable error. */
export async function sendMail({ cfg, to, from, mail }) {
  if (cfg.provider === "smtp") return sendSmtp({ smtp: cfg.smtp, to, from, mail });
  return sendSendGrid({ apiKey: cfg.apiKey, to, from, mail });
}

async function sendSmtp({ smtp, to, from, mail }) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass || "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({
      from: { address: from.email, name: oneLine(from.name, 100) },
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch (err) {
    const code = err?.responseCode || err?.code || "";
    const raw = String(err?.response || err?.message || "unknown error").replace(/\s+/g, " ").slice(0, 300);
    const hint =
      err?.code === "EAUTH"
        ? " Check SMTP_USER and SMTP_PASS."
        : /sender|from address|verified|not owned|relay/i.test(raw)
          ? ` The sender ${from.email} must be allowed (verified) on the mail server.`
          : ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(err?.code)
            ? ` Could not reach ${smtp.host}:${smtp.port}. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE.`
            : "";
    throw new Error(`The mail server refused the email${code ? ` (${code})` : ""}: ${raw}.${hint}`);
  } finally {
    transport.close();
  }
}

async function sendSendGrid({ apiKey, to, from, mail }) {
  const res = await safeFetch(SENDGRID_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    sensitiveHeaders: ["authorization"],
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from.email, name: oneLine(from.name, 100) },
      subject: mail.subject,
      content: [
        { type: "text/plain", value: mail.text },
        { type: "text/html", value: mail.html },
      ],
    }),
    timeoutMs: 20_000,
    maxRedirects: 0,
  });
  if (res.status < 200 || res.status >= 300) {
    let detail = "";
    try {
      detail = (JSON.parse(res.body)?.errors || []).map((e) => e.message).filter(Boolean).join("; ");
    } catch {
      /* not JSON */
    }
    const hint = /from address|sender identity|verified/i.test(detail) ? ` The sender ${from.email} must be verified in SendGrid.` : "";
    throw new Error(`SendGrid refused the email (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.${hint}`);
  }
}

const emailOwner = {
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "message"],
    properties: {
      subject: { type: "string", maxLength: 200, description: "Email subject line." },
      message: { type: "string", maxLength: 8000, description: "Email body in plain text: a short, clear summary for the owner." },
      includeReport: { type: "boolean", description: "Add the latest report created in this run (report.create_report) below the message. Default true." },
    },
  },
  async isReady(ctx = {}) {
    return Boolean(getEmailConfig() && (ctx.ownerEmail === undefined || ctx.ownerEmail));
  },
  async describe(ctx = {}) {
    return ctx.ownerEmail ? `The email always goes to the agent's owner (${ctx.ownerEmail}); you cannot choose the recipient.` : "";
  },
  async execute(args, ctx) {
    const cfg = getEmailConfig();
    if (!cfg) throw new Error("Email is not set up on the server (add SMTP_HOST/SMTP_USER/SMTP_PASS or SENDGRID_API_KEY).");
    const to = ctx.run?.ownerEmail;
    if (!to || !EMAIL_RE.test(to)) throw new Error("The agent's owner has no email address on file, so the email was not sent.");

    const reports = ctx.getReports?.() || [];
    const report = args.includeReport === false ? null : reports.at(-1) || null;
    const mail = buildEmail({ subject: args.subject, message: args.message, report, agentName: ctx.run?.agentName });
    // Owner-only email runs for real in test runs too (so "Run test" shows what arrives); mark it.
    if (ctx.run?.mode === "test") mail.subject = `[Test run] ${mail.subject}`.slice(0, 200);

    const from = await getSenderFor(ctx.run?.ownerId);
    await sendMail({ cfg, to, from, mail });
    return { sent: true, to, from: from.email, subject: mail.subject, includedReport: Boolean(report) };
  },
};

export const emailConnector = defineConnector({
  id: "email",
  actions: { email_owner: emailOwner },
  status: async () => {
    const cfg = getEmailConfig();
    if (!cfg) return { ready: false, message: "Set SMTP_HOST, SMTP_USER and SMTP_PASS (or SENDGRID_API_KEY) on the server" };
    const via = cfg.provider === "smtp" ? `SMTP ${cfg.smtp.host}:${cfg.smtp.port}` : "SendGrid API";
    return { ready: true, message: `Ready · ${via} · default sender ${cfg.from} (each user can set their own on the Email sender page)` };
  },
});
