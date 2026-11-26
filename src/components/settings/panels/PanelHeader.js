/** Section heading inside the Settings popup (smaller than a page title, like Claude's settings). */
export default function PanelHeader({ title, description }) {
  return (
    <div className="mb-6 border-b border-slate-200 pb-4">
      <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
    </div>
  );
}
