import { trpc } from "@/lib/trpc";
import { AdminError, AdminLoading } from "./adminUi";

export function AdminAuth() {
  const q = trpc.adminConsole.auth.useQuery(undefined, { staleTime: 20_000 });
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load auth diagnostics"} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Authentication</h1>
        <p className="text-sm text-muted-foreground">
          Safe operational view of application accounts. OAuth tokens, passwords, and session secrets are never loaded.
        </p>
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
        {d.deferred.map((line) => (
          <p key={line} className="mb-1 last:mb-0">{line}</p>
        ))}
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Login methods</h2>
        {d.loginMethods.map((m) => (
          <div key={m.method} className="flex justify-between border-b border-white/10 py-2 text-sm">
            <span>{m.method}</span>
            <span>{m.count}</span>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Recent sign-ins</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Last signed in</th>
              </tr>
            </thead>
            <tbody>
              {d.recentSignIns.map((u) => (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="px-3 py-2">{u.name || u.openId}</td>
                  <td className="px-3 py-2">{u.email ?? "—"}</td>
                  <td className="px-3 py-2">{u.loginMethod ?? "—"}</td>
                  <td className="px-3 py-2">{u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {d.duplicateEmails.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Duplicate emails</h2>
          {d.duplicateEmails.map((e) => (
            <div key={e.email} className="text-sm">{e.email} · {e.count}</div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
