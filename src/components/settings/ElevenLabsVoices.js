"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

const ID_RE = /^[A-Za-z0-9]{10,40}$/;

/**
 * Saved ElevenLabs voices: add a few (name + Voice ID), pick which one speaks, remove.
 * Changes are saved with the rest of Model Settings ("Save settings").
 */
export default function ElevenLabsVoices({ voices, activeId, onChange, max = 10, error }) {
  const [row, setRow] = useState({ name: "", id: "" });
  const id = row.id.trim();
  const name = row.name.trim();
  const duplicate = voices.some((v) => v.id === id);
  const canAdd = name && ID_RE.test(id) && !duplicate && voices.length < max;
  // A voice from .env that is not in the list yet is shown so it is not lost.
  const list = activeId && !voices.some((v) => v.id === activeId) ? [{ id: activeId, name: "Current voice", unsaved: true }, ...voices] : voices;

  function add() {
    // The first voice added becomes the one in use.
    onChange({ voices: [...voices, { id, name }], activeId: voices.length ? activeId : id });
    setRow({ name: "", id: "" });
  }

  function keepCurrent(v) {
    onChange({ voices: [...voices, { id: v.id, name: v.name }], activeId });
  }

  function remove(vid) {
    const next = voices.filter((v) => v.id !== vid);
    onChange({ voices: next, activeId: vid === activeId ? next[0]?.id || activeId : activeId });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800">ElevenLabs voices</p>
        <p className="text-xs text-slate-500">Save a few voices and choose which one speaks. Voice ID: elevenlabs.io → Voices → My Voices → ⋯ → Copy Voice ID.</p>
      </div>

      {list.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {list.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="elevenlabsVoice"
                  className="size-4 accent-emerald-600"
                  checked={v.id === activeId}
                  onChange={() => onChange({ voices, activeId: v.id })}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-800">{v.name}</span>
                  <span className="block truncate font-mono text-xs text-slate-500">{v.id}</span>
                </span>
              </label>
              {v.id === activeId && <Badge tone="success">In use</Badge>}
              {v.unsaved ? (
                <Button variant="secondary" size="sm" onClick={() => keepCurrent(v)}>
                  Keep in list
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => remove(v.id)} aria-label={`Remove ${v.name}`}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {voices.length < max ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name" htmlFor="evName" className="min-w-36 flex-1">
            <Input id="evName" placeholder="e.g. Aarush (male)" value={row.name} onChange={(e) => setRow({ ...row, name: e.target.value })} />
          </Field>
          <Field label="Voice ID" htmlFor="evId" className="min-w-48 flex-1">
            <Input
              id="evId"
              className="font-mono"
              placeholder="e.g. pNInz6obpgDQGcFmaJgB"
              autoComplete="off"
              spellCheck={false}
              value={row.id}
              onChange={(e) => setRow({ ...row, id: e.target.value })}
              invalid={Boolean(id) && (!ID_RE.test(id) || duplicate)}
            />
          </Field>
          <Button variant="secondary" onClick={add} disabled={!canAdd}>
            Add voice
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Up to {max} voices. Remove one to add another.</p>
      )}
      {id && duplicate && <p className="text-xs text-red-600">This Voice ID is already in the list.</p>}
      {id && !duplicate && !ID_RE.test(id) && <p className="text-xs text-red-600">A Voice ID is 10–40 letters and numbers, without spaces.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">Click “Save settings” after adding, removing or switching voices.</p>
    </div>
  );
}
