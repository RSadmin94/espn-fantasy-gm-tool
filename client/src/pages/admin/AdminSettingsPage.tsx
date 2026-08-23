import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminError, AdminLoading } from "./adminUi";

export function AdminSettingsPage() {
  const q = trpc.adminConsole.settings.useQuery();
  const save = trpc.adminConsole.saveSettings.useMutation({ onSuccess: () => q.refetch() });
  const session = trpc.me.session.useQuery();
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!q.data) return;
    setBudget(q.data.monthlyBudgetUsd != null ? String(q.data.monthlyBudgetUsd) : "");
    setMessage(q.data.maintenanceMessage);
  }, [q.data]);
  if (q.isLoading) return <AdminLoading />;
  if (q.isError || !q.data) return <AdminError message={q.error?.message ?? "Could not load settings"} />;
  const canManage = session.data?.isOwner === true;
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Configuration</h1>
      <p className="text-sm text-muted-foreground">{q.data.note}</p>
      <label className="block text-sm">
        Monthly AI budget (USD)
        <Input className="mt-1" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={!canManage} />
        <span className="mt-1 block text-xs text-muted-foreground">
          Used for Usage &amp; Cost projections and health. Does not hard-block LLM calls.
        </span>
      </label>
      <label className="block text-sm">
        Maintenance message
        <Input className="mt-1" value={message} disabled placeholder="Not yet enforced" />
        <span className="mt-1 block text-xs text-amber-400">Not yet enforced — not shown to product users.</span>
      </label>
      <Button
        disabled={!canManage || save.isPending}
        onClick={() =>
          save.mutate({
            monthlyBudgetUsd: budget.trim() === "" ? null : Number(budget),
          })
        }
      >
        Save
      </Button>
      {save.error ? <p className="text-xs text-red-400">{save.error.message}</p> : null}
    </div>
  );
}
