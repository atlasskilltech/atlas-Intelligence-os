import UsersManager from "@/components/users/UsersManager";
import PanelHeader from "./PanelHeader";
import { Alert } from "@/components/ui/States";

/** Account tab of the Settings popup (admins): who can sign in, and their roles. Data comes from /api/settings/panel/account. */
export default function AccountView({ isAdmin, db, google, authEnabled, users = [], loadError, currentUid, tablePrefix }) {
  if (!isAdmin) {
    return (
      <>
        <PanelHeader title="Account" />
        <Alert tone="warning" title="Admins only">
          Only administrators can see and manage users.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PanelHeader
        title="Account"
        description="People who can sign in to IntelligenceOS with Google. Admins can add users, change roles and remove users; users manage only their own agents."
      />

      <div className="mb-6 grid gap-3 @2xl:grid-cols-3">
        <Status label="Database" ok={db.connected} text={db.connected ? `Connected · ${db.version}` : db.configured ? `Not connected: ${db.error}` : "Not configured"} />
        <Status label="Google sign-in" ok={google.configured} text={google.configured ? "Configured" : "Not configured"} />
        <Status label="Login" ok={authEnabled} text={authEnabled ? "Required for everyone" : "Off — the app is open without login"} />
      </div>

      {!authEnabled && (
        <Alert tone="warning" className="mb-6" title="Login is off">
          Set the database and Google settings on the server and restart the app. Until then everyone uses the app as one local admin.
        </Alert>
      )}
      {loadError && (
        <Alert tone="error" className="mb-6">
          {loadError}
        </Alert>
      )}

      {db.connected && <UsersManager initialUsers={users} currentUid={currentUid} />}

      {db.configured && (
        <p className="mt-6 text-xs text-slate-500">
          Stored in the <code className="font-mono">{tablePrefix}users</code> table · server settings used: {db.names.join(", ")}
          {google.configured ? `, ${google.names.join(", ")}` : ""}
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
