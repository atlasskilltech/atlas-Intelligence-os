import { connection } from "next/server";
import UsersManager from "@/components/users/UsersManager";
import PageHeader from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/States";
import { getGoogleAuth, isAuthEnabled } from "@/lib/config/env";
import { getPageActor } from "@/lib/context";
import { TABLE_PREFIX, dbStatus } from "@/lib/db/mysql";
import { listUsers } from "@/lib/users/userRepo";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await connection();
  const actor = await getPageActor();
  if (actor.role !== "admin") {
    return (
      <>
        <PageHeader title="Users" />
        <Alert tone="warning" title="Admins only">
          Only administrators can see and manage users.
        </Alert>
      </>
    );
  }

  const db = await dbStatus();
  let users = [];
  let loadError = null;
  if (db.connected) {
    try {
      users = await listUsers(actor);
    } catch (err) {
      loadError = err.publicMessage || "Could not load users.";
    }
  }
  const google = getGoogleAuth();

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can sign in to IntelligenceOS with Google. Admins can add users, change roles and remove users; users manage only their own agents."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Status label="Database" ok={db.connected} text={db.connected ? `Connected · ${db.version}` : db.configured ? `Not connected: ${db.error}` : "Not configured"} />
        <Status label="Google sign-in" ok={Boolean(google)} text={google ? "Configured" : "Not configured"} />
        <Status label="Login" ok={isAuthEnabled()} text={isAuthEnabled() ? "Required for everyone" : "Off — the app is open without login"} />
      </div>

      {!isAuthEnabled() && (
        <Alert tone="warning" className="mb-6" title="Login is off">
          Set the database and Google settings on the server and restart the app. Until then everyone uses the app as one local admin.
        </Alert>
      )}
      {loadError && (
        <Alert tone="error" className="mb-6">
          {loadError}
        </Alert>
      )}

      {db.connected && <UsersManager initialUsers={users} currentUid={actor.uid} />}

      {db.configured && (
        <p className="mt-6 text-xs text-slate-500">
          Stored in the <code className="font-mono">{TABLE_PREFIX}users</code> table · server settings used: {db.names.join(", ")}
          {google ? `, ${google.names.join(", ")}` : ""}
        </p>
      )}
    </>
  );
}

function Status({ label, ok, text }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 flex items-center gap-2 text-sm font-medium ${ok ? "text-emerald-700" : "text-amber-700"}`}>
        <span className={`size-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
        <span className="min-w-0 break-words">{text}</span>
      </p>
    </div>
  );
}
