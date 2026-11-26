import "server-only";
import { getSendGridConfig } from "../../config/env.js";
import { defineConnector } from "../defineConnector.js";
import { safeFetch } from "../http/safeFetch.js";

/**
 * Email connector (SendGrid). One action: email the agent's OWNER.
 * The recipient is never taken from the model's arguments — it is always
 * ctx.run.ownerEmail — so an agent cannot email anyone else.
 *
 * Env: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL (verified sender), optional SENDGRID_FROM_NAME.
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
    const cfg = getSendGridConfig();
    return Boolean(cfg?.from && (ctx.ownerEmail === undefined || ctx.ownerEmail));
  },
  async describe(ctx = {}) {
    return ctx.ownerEmail ? `The email always goes to the agent's owner (${ctx.ownerEmail}); you cannot choose the recipient.` : "";
  },
  async execute(args, ctx) {
    const cfg = getSendGridConfig();
    if (!cfg) throw new Error("Email is not set up: SENDGRID_API_KEY is missing on the server.");
    if (!cfg.from || !EMAIL_RE.test(cfg.from)) throw new Error("Email is not set up: SENDGRID_FROM_EMAIL (a verified SendGrid sender) is missing or invalid.");
    const to = ctx.run?.ownerEmail;
    if (!to || !EMAIL_RE.test(to)) throw new Error("The agent's owner has no email address on file, so the email was not sent.");

    const reports = ctx.getReports?.() || [];
    const report = args.includeReport === false ? null : reports.at(-1) || null;
    const mail = buildEmail({ subject: args.subject, message: args.message, report, agentName: ctx.run?.agentName });

    const res = await safeFetch(SENDGRID_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      sensitiveHeaders: ["authorization"],
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: cfg.from, name: oneLine(cfg.fromName, 100) },
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
      throw new Error(`SendGrid refused the email (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}.`);
    }
    return { sent: true, to, subject: mail.subject, includedReport: Boolean(report) };
  },
};

export const emailConnector = defineConnector({
  id: "email",
  actions: { email_owner: emailOwner },
  status: async () => {
    const cfg = getSendGridConfig();
    if (!cfg) return { ready: false, message: "Set SENDGRID_API_KEY on the server" };
    if (!cfg.from) return { ready: false, message: "Set SENDGRID_FROM_EMAIL (a verified SendGrid sender)" };
    return { ready: true, message: `Ready · sends from ${cfg.from}` };
  },
});
