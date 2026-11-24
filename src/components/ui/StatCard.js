import { Card } from "./Card";
import Icon from "./Icon";

export default function StatCard({ label, value, hint, icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-500">
            <Icon name={icon} className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
