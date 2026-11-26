import { getAppUrl } from "../config/env.js";
import { isMailConfigured, mailStatus, sendMail as realSendMail } from "../email/mailer.js";
import { buildReportEmail, isEmailAddress } from "../email/reportEmail.js";
import { defineConnector } from "./defineConnector.js";

/**
 * Email connector: sends the run's report to the agent OWNER only.
 * There is deliberately no recipient parameter — the address always comes
 * from the run (the owner's sign-in email), never from the model.
 */
export const emailConnector = defineConnector({
  id: "email",
  actions: {
    email_owner: {
      parameters: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          subject: { type: "string", maxLength: 180, description: "Optional subject. Default: the report title." },
          message: { type: "string", maxLength: 2000, description: "Optional short note shown above the report." },
        },
      },
      isReady: async (ctx = {}) => isMailConfigured() && isEmailAddress(ctx.ownerEmail),
      describe: async (ctx = {}) => (ctx.ownerEmail ? `Sends to the agent owner (${ctx.ownerEmail}). Call it after report.create_report.` : ""),
      async execute(args, ctx) {
        const to = ctx.run?.ownerEmail;
        if (!isEmailAddress(to)) throw new Error("The agent owner has no email address on record, so the report cannot be emailed.");
        const reports = ctx.getReports?.() || [];
        const report = reports[reports.length - 1];
        if (!report) throw new Error("No report yet. Call report.create_report first, then email_owner.");
        const base = getAppUrl();
        const email = buildReportEmail(report, {
          agentName: ctx.run.agentName,
          subject: args.subject,
          message: args.message,
          runUrl: base ? `${base}/runs/${encodeURIComponent(ctx.run.id)}` : undefined,
          test: ctx.run.mode === "test",
        });
        await (ctx.sendMail || realSendMail)({ to, ...email });
        return { sent: true, to, subject: email.subject };
      },
    },
  },
  status: async () => mailStatus(),
});
