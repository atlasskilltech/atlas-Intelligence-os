"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";

async function api(path, options) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Request failed."), { fields: data?.error?.fields });
  return data;
}

const when = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "Never";

function Avatar({ user }) {
  if (user.picture) {
    // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
    return <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full" />;
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-800 text-sm font-bold text-white">
      {(user.name || user.email)[0].toUpperCase()}
    </span>
  );
}

export default function UsersManager({ initialUsers, currentUid }) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState({ email: "", name: "", role: "user" });
  const [adding, setAdding] = useState({ state: "idle" });
  const [errors, setErrors] = useState({});
  const [rowBusy, setRowBusy] = useState(null);
  const [message, setMessage] = useState(null);
  const [removing, setRemoving] = useState(null);

  const admins = users.filter((u) => u.role === "admin").length;

  async function add(e) {
    e.preventDefault();
    setAdding({ state: "saving" });
    setErrors({});
    setMessage(null);
    try {
      const { user } = await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setUsers((list) => [...list, user]);
      setForm({ email: "", name: "", role: "user" });
      setAdding({ state: "idle" });
      setMessage({ tone: "success", text: `${user.email} added. They can now sign in with Google.` });
    } catch (err) {
      setErrors(err.fields || {});
      setAdding({ state: "error", message: err.message });
    }
  }

  async function setRole(user, role) {
    setRowBusy(user.id);
    setMessage(null);
    try {
      const { user: updated } = await api(`/api/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      setMessage({ tone: "success", text: `${updated.email} is now ${role === "admin" ? "an admin" : "a user"}.` });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setRowBusy(null);
    }
  }

  async function confirmRemove() {
    setRemoving((r) => ({ ...r, busy: true, error: null }));
    try {
      await api(`/api/users/${removing.user.id}`, { method: "DELETE" });
      setUsers((list) => list.filter((u) => u.id !== removing.user.id));
      setMessage({ tone: "success", text: `${removing.user.email} removed.` });
      setRemoving(null);
    } catch (err) {
      setRemoving((r) => ({ ...r, busy: false, error: err.message }));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={add} noValidate>
          <CardHeader title="Add a user" description="They sign in with this Google account. Nobody else can sign in." />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-[2fr_1.5fr_1fr_auto] sm:items-start">
              <Field label="Email" htmlFor="u-email" error={errors.email}>
                <Input
                  id="u-email"
                  type="email"
                  value={form.email}
                  placeholder="name@atlasuniversity.edu.in"
                  invalid={!!errors.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field label="Name (optional)" htmlFor="u-name">
                <Input id="u-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label="Role" htmlFor="u-role">
                <Select id="u-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
              <Button type="submit" className="sm:mt-6.5" disabled={adding.state === "saving" || !form.email.trim()}>
                {adding.state === "saving" ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="plus" className="size-4" />}
                Add user
              </Button>
            </div>
            {adding.state === "error" && !Object.keys(errors).length && (
              <Alert tone="error" className="mt-4">
                {adding.message}
              </Alert>
            )}
          </CardBody>
        </form>
      </Card>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card>
        <CardHeader title={`${users.length} user${users.length === 1 ? "" : "s"}`} description={`${admins} admin${admins === 1 ? "" : "s"}`} />
        <ul className="divide-y divide-slate-100">
          {users.map((u) => {
            const me = u.id === currentUid;
            const lastAdmin = u.role === "admin" && admins <= 1;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                <Avatar user={u} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    <span className="truncate">{u.name || u.email}</span>
                    {me && <Badge tone="brand">You</Badge>}
                    {!u.lastLoginAt && <Badge>Not signed in yet</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email} · last sign-in {when(u.lastLoginAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {rowBusy === u.id && <Spinner className="size-4" />}
                  <label className="sr-only" htmlFor={`role-${u.id}`}>
                    Role for {u.email}
                  </label>
                  <Select
                    id={`role-${u.id}`}
                    className="w-28"
                    value={u.role}
                    disabled={rowBusy === u.id || (lastAdmin && u.role === "admin")}
                    title={lastAdmin ? "The last admin can't be changed" : undefined}
                    onChange={(e) => setRole(u, e.target.value)}
                  >
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={me || lastAdmin}
                    title={me ? "You can't delete yourself" : lastAdmin ? "The last admin can't be deleted" : undefined}
                    onClick={() => setRemoving({ user: u })}
                    aria-label={`Delete ${u.email}`}
                  >
                    <Icon name="trash" className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <ConfirmDialog
        open={!!removing}
        title={`Remove ${removing?.user.email}?`}
        confirmLabel="Remove user"
        busy={removing?.busy}
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
      >
        They will be signed out and can&apos;t sign in again unless an admin adds them back. Their agents stay; admins can still see them.
        {removing?.error && <p className="mt-2 text-red-600">{removing.error}</p>}
      </ConfirmDialog>
    </div>
  );
}
