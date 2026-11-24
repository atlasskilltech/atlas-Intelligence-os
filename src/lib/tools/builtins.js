/**
 * Built-in tools that work without any external connector (Milestone 5).
 * Each tool: { parameters (JSON schema), execute(args, ctx) → result data }.
 * `ctx` provides side-effect hooks so the engine (and tests) control storage:
 *   ctx.addReport(report), ctx.notify({ message, level })
 */

const text = (maxLength, description) => ({ type: "string", maxLength, description });

export const BUILTIN_TOOLS = {
  "report.create_report": {
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary"],
      properties: {
        title: text(200, "Report title."),
        summary: text(4000, "Short overview of the findings (plain text)."),
        sections: {
          type: "array",
          maxItems: 20,
          description: "Optional sections, each with a heading and plain-text body.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["heading", "body"],
            properties: { heading: text(200), body: text(8000) },
          },
        },
        tables: {
          type: "array",
          maxItems: 10,
          description: "Optional tables. Every row must have one cell per column.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["columns", "rows"],
            properties: {
              title: text(200),
              columns: { type: "array", maxItems: 12, items: text(100) },
              rows: { type: "array", maxItems: 200, items: { type: "array", maxItems: 12, items: text(1000) } },
            },
          },
        },
      },
    },
    async execute(args, ctx) {
      const report = {
        title: args.title,
        summary: args.summary,
        sections: args.sections || [],
        tables: (args.tables || []).map((t) => ({
          title: t.title || "",
          columns: t.columns,
          rows: t.rows.map((r) => t.columns.map((_, i) => (r[i] == null ? "" : String(r[i])))),
        })),
      };
      await ctx.addReport(report);
      return { saved: true, title: report.title, sections: report.sections.length, tables: report.tables.length };
    },
  },

  "notify.notify_owner": {
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["message"],
      properties: {
        message: text(500, "The notification text (plain language)."),
        level: { type: "string", enum: ["info", "success", "warning", "error"], description: "Default info." },
      },
    },
    async execute(args, ctx) {
      await ctx.notify({ message: args.message, level: args.level || "info" });
      return { delivered: true };
    },
  },
};
