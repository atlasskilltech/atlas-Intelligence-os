/**
 * Turns an agent report ({ title, summary, sections, tables }) into an email
 * (subject, HTML and plain text). Pure: no network, no env — easy to test.
 * Report text comes from the model and tool data, so every value is escaped.
 */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const paras = (s) =>
  String(s ?? "")
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
// Subjects are one line: strip newlines (header injection) and cap length.
const oneLine = (s, n) => String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

const CELL = "border:1px solid #e2e8f0;padding:6px 10px;text-align:left;vertical-align:top;font-size:13px";

function tableHtml(t) {
  const head = t.columns.map((c) => `<th style="${CELL};background:#f1f5f9">${esc(c)}</th>`).join("");
  const body = t.rows.length
    ? t.rows.map((r) => `<tr>${t.columns.map((_, i) => `<td style="${CELL}">${esc(r[i])}</td>`).join("")}</tr>`).join("")
    : `<tr><td style="${CELL};color:#64748b" colspan="${t.columns.length || 1}">No rows</td></tr>`;
  return `${t.title ? `<h3 style="margin:20px 0 8px;font-size:15px">${esc(t.title)}</h3>` : ""}<table style="border-collapse:collapse;width:100%;margin:0 0 16px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function tableText(t) {
  const lines = [t.title ? `${t.title}` : "", t.columns.join(" | "), ...t.rows.map((r) => t.columns.map((_, i) => r[i] ?? "").join(" | "))];
  if (!t.rows.length) lines.push("(no rows)");
  return lines.filter((l, i) => i > 0 || l).join("\n");
}

/**
 * @param report  the run's report
 * @param opts    { agentName, subject?, message?, runUrl?, test? }
 */
export function buildReportEmail(report, { agentName = "Agent", subject, message, runUrl, test = false } = {}) {
  const title = report?.title || agentName;
  const sections = report?.sections || [];
  const tables = report?.tables || [];
  const subj = `${test ? "[Test run] " : ""}${oneLine(subject || title, 180) || "Agent report"}`;

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:760px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:#64748b">${esc(agentName)}${test ? " · test run" : ""}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#047857">${esc(title)}</h1>
${message ? `<div style="margin:0 0 16px;padding:12px;background:#ecfdf5;border-radius:8px;font-size:14px">${paras(message)}</div>` : ""}
<div style="font-size:14px;line-height:1.5">${paras(report?.summary)}</div>
${sections.map((s) => `<h2 style="margin:20px 0 8px;font-size:16px">${esc(s.heading)}</h2><div style="font-size:14px;line-height:1.5">${paras(s.body)}</div>`).join("")}
${tables.map(tableHtml).join("")}
${runUrl ? `<p style="margin:20px 0 0;font-size:13px"><a href="${esc(runUrl)}" style="color:#047857">Open this run in IntelligenceOS</a></p>` : ""}
</div>
<p style="margin:12px 0 0;font-size:11px;color:#94a3b8">Sent by ATLAS IntelligenceOS because you own the agent "${esc(agentName)}".</p>
</div></body></html>`;

  const text = [
    `${agentName}${test ? " (test run)" : ""}`,
    title,
    "",
    message ? `${message}\n` : "",
    report?.summary || "",
    ...sections.map((s) => `\n${s.heading}\n${s.body}`),
    ...tables.map((t) => `\n${tableText(t)}`),
    runUrl ? `\nOpen this run: ${runUrl}` : "",
    `\nSent by ATLAS IntelligenceOS because you own the agent "${agentName}".`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject: subj, html, text };
}

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export const isEmailAddress = (s) => typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s);
