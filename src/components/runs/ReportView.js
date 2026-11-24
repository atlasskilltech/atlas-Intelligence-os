/** Renders a report created by the report.create_report tool. All text is escaped by React. */
export default function ReportView({ report }) {
  return (
    <article className="space-y-5">
      <header>
        <h3 className="text-lg font-bold text-ink">{report.title}</h3>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{report.summary}</p>
      </header>
      {report.sections?.map((s, i) => (
        <section key={i}>
          <h4 className="text-sm font-semibold text-ink">{s.heading}</h4>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{s.body}</p>
        </section>
      ))}
      {report.tables?.map((t, i) => (
        <section key={i}>
          {t.title && <h4 className="mb-2 text-sm font-semibold text-ink">{t.title}</h4>}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {t.columns.map((c, j) => (
                    <th key={j} className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 align-top text-slate-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  );
}
