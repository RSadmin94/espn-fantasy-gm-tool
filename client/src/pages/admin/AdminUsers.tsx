import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { AdminError, AdminLoading, StatusBadge, money } from "./adminUi";

export function AdminUsers() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const usersQ = trpc.adminConsole.users.useQuery(
    { q: q.trim() || undefined, status: status === "all" ? undefined : status, role: role === "all" ? undefined : role },
    { staleTime: 15_000 },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">Search and inspect application accounts.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, user ID, Clerk ID" className="max-w-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="watched">Watched</option>
          <option value="throttled">Throttled</option>
          <option value="restricted">Restricted</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      {usersQ.isLoading ? <AdminLoading /> : null}
      {usersQ.isError ? <AdminError message={usersQ.error.message} /> : null}
      {usersQ.data ? (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2 text-right">Leagues</th>
                <th className="px-3 py-2">Last signed in</th>
                <th className="px-3 py-2 text-right">MTD req</th>
                <th className="px-3 py-2 text-right">MTD cost</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {usersQ.data.rows.map((u) => (
                <tr key={u.id} className="border-t border-white/10 hover:bg-white/[0.03]">
                  <td className="px-3 py-2">
                    <Link to={`/admin/users/${u.id}`} className="font-medium text-lime-300 hover:underline">
                      {u.name || `User ${u.id}`}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{u.email ?? "—"}</td>
                  <td className="px-3 py-2">{u.isOwner ? "owner" : u.role}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.leagues}</td>
                  <td className="px-3 py-2 text-zinc-400">{u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.requestsMtd}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(u.costMtd)}</td>
                  <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
