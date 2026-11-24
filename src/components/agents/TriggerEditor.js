"use client";

import { Field, Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { DAYS, DAY_LABEL, DEFAULT_TIMEZONE, describeTrigger, normalizeSchedule } from "@/lib/agents/schedule";

const TYPES = [
  { id: "manual", label: "Manual", hint: "Run it yourself" },
  { id: "schedule", label: "Schedule", hint: "Daily, weekly…" },
  { id: "webhook", label: "Webhook", hint: "Another system starts it" },
];

/** Edits trigger = { type, schedule }. Schedule fields are kept raw while editing. */
export default function TriggerEditor({ trigger, onChange }) {
  const schedule = trigger.schedule ?? { frequency: "daily", time: "09:00", daysOfWeek: [], dayOfMonth: null, timezone: DEFAULT_TIMEZONE };
  const setSchedule = (patch) => onChange({ ...trigger, schedule: { ...schedule, ...patch } });
  const toggleDay = (d) =>
    setSchedule({
      daysOfWeek: schedule.daysOfWeek.includes(d) ? schedule.daysOfWeek.filter((x) => x !== d) : [...schedule.daysOfWeek, d],
    });

  const summary = describeTrigger(
    trigger.type === "schedule" ? { type: "schedule", schedule: normalizeSchedule(schedule) } : trigger,
  );

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="How the agent starts" className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => {
          const active = trigger.type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ type: t.id, schedule: t.id === "schedule" ? schedule : null })}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <span className={cn("block text-sm font-semibold", active ? "text-brand-700" : "text-navy-800")}>{t.label}</span>
              <span className="hidden text-xs text-slate-500 sm:block">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {trigger.type === "schedule" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Repeat" htmlFor="freq">
            <Select
              id="freq"
              value={schedule.frequency}
              onChange={(e) => {
                const frequency = e.target.value;
                // Make the default visible and real: weekly starts on Monday, monthly on the 1st.
                setSchedule({
                  frequency,
                  ...(frequency === "weekly" && schedule.daysOfWeek.length === 0 ? { daysOfWeek: ["mon"] } : {}),
                  ...(frequency === "monthly" && !schedule.dayOfMonth ? { dayOfMonth: 1 } : {}),
                });
              }}
            >
              <option value="hourly">Every hour</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </Select>
          </Field>
          <Field label={schedule.frequency === "hourly" ? "Minute past the hour" : "Time"} htmlFor="time">
            <Input id="time" type="time" value={schedule.time} onChange={(e) => setSchedule({ time: e.target.value })} />
          </Field>
          <Field label="Time zone" htmlFor="tz">
            <Input id="tz" value={schedule.timezone} onChange={(e) => setSchedule({ timezone: e.target.value })} />
          </Field>
          {schedule.frequency === "weekly" && (
            <div className="sm:col-span-3">
              <p className="mb-1.5 text-sm font-medium text-slate-700">On these days</p>
              <div className="flex flex-wrap gap-1.5">
                {[...DAYS.slice(1), DAYS[0]].map((d) => {
                  const on = schedule.daysOfWeek.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "h-9 w-12 rounded-lg border text-sm font-medium",
                        on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      )}
                    >
                      {DAY_LABEL[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {schedule.frequency === "monthly" && (
            <Field label="Day of month" htmlFor="dom" hint="1–28">
              <Input
                id="dom"
                type="number"
                min={1}
                max={28}
                value={schedule.dayOfMonth ?? 1}
                onChange={(e) => setSchedule({ dayOfMonth: e.target.value })}
              />
            </Field>
          )}
        </div>
      )}

      <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <span className="font-medium text-navy-800">Runs:</span> {summary}
      </p>
      {trigger.type !== "manual" && (
        <p className="text-xs text-slate-500">Automatic runs start working in Milestone 9. Until then you can run agents manually.</p>
      )}
    </div>
  );
}
