import { useState } from "react";
import { Link, useParams } from "react-router";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminError, AdminLoading, StatusBadge, money } from "./adminUi";

export function AdminUserDetail() {
  const { userId } = useParams();
  const id = Number(userId);
  const q = trpc.adminConsole.userDetail.useQuery({ userId: id }, { enabled: Number.isInteger(id) && id > 0 });
  const session = trpc.me.session.useQuery();
  const setControl = trpc.adminConsole.setAccountControl.useMutation({ onSuccess: () => q.refetch() });
  const setRole = trpc.adminConsole.setUserRole.useMutation({ onSuccess: () => q.refetch() });
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const isOwnerActor = session.data?.isOwner === true;

  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "User not found"} />;
  const d = q.data;

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-foreground">← Users</Link>
      <div>
        <h1 className="text-2xl font-bold">{d.identity.name || `User ${d.identity.id}`}</h1>
        <p className="text-sm text-muted-foreground">{d.identity.email ?? "No email captured"}</p>
      </div>
      <section className="grid gap-3 md:grid-cols-2">
        <Info label="Internal ID" value={String(d.identity.id)} />
        <Info label="Clerk ID" value={d.identity.openId} />
        <Info label="Role" value={d.identity.isOwner ? "owner" : d.identity.role} />
        <Info label="Login method" value={d.identity.loginMethod ?? "—"} />
        <Info label="Created" value={new Date(d.identity.createdAt).toLocaleString()} />
        <Info label="Last signed in" value={new Date(d.identity.lastSignedIn).toLocaleString()} />
        <Info label="Subscription" value={d.identity.subscriptionStatus} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Leagues</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">League</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Sync</th>
              </tr>
            </thead>
            <tbody>
              {d.leagues.map((l) => (
                <tr key={l.id} className="border-t border-white/10">
                  <td className="px-3 py-2">
                    <Link className="text-lime-300 hover:underline" to={`/admin/leagues/${encodeURIComponent(l.provider)}/${encodeURIComponent(l.leagueId)}`}>
                      {l.leagueName || l.leagueId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{l.provider}</td>
                  <td className="px-3 py-2">{l.selectedFranchiseName || l.selectedOwnerName || "—"}</td>
                  <td className="px-3 py-2"><StatusBadge status={l.syncStatus ?? "unknown"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">AI usage (MTD)</h2>
        <div className="space-y-1 text-sm">
          {d.aiUsage.length === 0 ? <p className="text-muted-foreground">No LLM events this month.</p> : d.aiUsage.map((u) => (
            <div key={`${u.provider}-${u.model}`} className="flex justify-between rounded border border-white/10 px-3 py-2">
              <span>{u.provider}/{u.model}</span>
              <span>{u.requests} req · {money(u.costUsd)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Feature usage (30d)</h2>
        {d.features.map((f) => (
          <div key={f.featureId} className="flex justify-between border-b border-white/10 py-2 text-sm">
            <span>{f.featureId}</span>
            <span>{f.requests} · {money(f.costUsd)}</span>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Recent errors</h2>
        {d.errors.length === 0 ? <p className="text-sm text-muted-foreground">None stored.</p> : d.errors.map((e) => (
          <div key={e.id} className="border-b border-white/10 py-2 text-xs">
            {String(e.createdAt)} · {e.featureName} · {e.errorCode ?? "ERROR"}
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-amber-500/20 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-amber-300">Restrictions</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Owner-only. The owner account cannot suspend or disable itself. Suspended blocks the signed-in product
          (except the session probe). Disable AI only blocks LLM. Daily token limit is UTC (00:00–24:00).
        </p>
        <div className="flex flex-wrap gap-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="max-w-xs" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit)" className="max-w-xs" />
          <Input
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            placeholder="Daily token limit"
            className="max-w-[180px]"
            inputMode="numeric"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["active", "watched", "throttled", "restricted", "suspended"] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant="outline"
              disabled={!isOwnerActor || setControl.isPending}
              onClick={() =>
                setControl.mutate({
                  userId: d.identity.id,
                  status,
                  aiDisabled: status === "suspended",
                  dailyTokenLimit: dailyLimit.trim() === "" ? (d.control?.dailyTokenLimit ?? null) : Number(dailyLimit),
                  notes: notes || null,
                  reason: reason || null,
                })
              }
            >
              {status}
            </Button>
          ))}
          <Button
            size="sm"
            variant="destructive"
            disabled={!isOwnerActor || setControl.isPending}
            onClick={() =>
              setControl.mutate({
                userId: d.identity.id,
                status: d.control?.status ?? "active",
                aiDisabled: true,
                dailyTokenLimit: dailyLimit.trim() === "" ? (d.control?.dailyTokenLimit ?? null) : Number(dailyLimit),
                notes: notes || null,
                reason: reason || "AI disabled",
              })
            }
          >
            Disable AI
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!isOwnerActor || setControl.isPending}
            onClick={() =>
              setControl.mutate({
                userId: d.identity.id,
                status: d.control?.status ?? "active",
                aiDisabled: d.control?.aiDisabled ?? false,
                dailyTokenLimit: dailyLimit.trim() === "" ? null : Number(dailyLimit),
                notes: notes || null,
                reason: reason || "daily token limit",
              })
            }
          >
            Save daily token limit
          </Button>
        </div>
        {setControl.error ? <p className="mt-2 text-xs text-red-400">{setControl.error.message}</p> : null}
        {isOwnerActor && !d.identity.isOwner ? (
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" disabled={setRole.isPending} onClick={() => setRole.mutate({ userId: d.identity.id, role: "admin", reason: reason || "promote admin" })}>
              Make admin
            </Button>
            <Button size="sm" variant="outline" disabled={setRole.isPending} onClick={() => setRole.mutate({ userId: d.identity.id, role: "user", reason: reason || "demote" })}>
              Make user
            </Button>
          </div>
        ) : null}
        {setRole.error ? <p className="mt-2 text-xs text-red-400">{setRole.error.message}</p> : null}
        <p className="mt-2 text-xs text-zinc-500">
          Current: {d.control?.status ?? "active"} {d.control?.aiDisabled ? "· AI disabled" : ""}
          {d.control?.dailyTokenLimit != null ? ` · daily cap ${d.control.dailyTokenLimit}` : ""}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-zinc-400">Audit history</h2>
        {d.audit.length === 0 ? <p className="text-sm text-muted-foreground">No admin actions recorded for this user.</p> : d.audit.map((a) => (
          <div key={a.id} className="border-b border-white/10 py-2 text-xs">
            {String(a.createdAt)} · {a.action} · actor {a.actorUserId}
          </div>
        ))}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 px-3 py-2">
      <div className="text-[11px] uppercase text-zinc-500">{label}</div>
      <div className="break-all text-sm">{value}</div>
    </div>
  );
}
