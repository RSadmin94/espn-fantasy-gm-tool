import { useState } from "react";
import { useNavigate } from "react-router";
import { useSignIn } from "@clerk/clerk-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * One-click "Try Demo".
 *
 * Mints a Clerk sign-in ticket server-side (demo.start) and completes sign-in with Clerk's
 * standard `ticket` strategy, landing the visitor in the read-only demo account — no signup,
 * no ESPN, no password in the browser. If the demo isn't configured, start() fails and we show
 * a soft message rather than doing anything.
 */
export function TryDemoButton() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = trpc.demo.start.useMutation();

  async function onClick() {
    if (!isLoaded || !signIn || busy) return;
    setBusy(true);
    try {
      const { ticket } = await start.mutateAsync();
      const res = await signIn.create({ strategy: "ticket", ticket });
      if (res.status === "complete" && res.createdSessionId) {
        await setActive({ session: res.createdSessionId });
        navigate("/dashboard");
        return;
      }
      throw new Error("incomplete");
    } catch {
      toast.error("The demo isn't available right now. Please try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || !isLoaded}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-lime-500/40 bg-lime-500/10 px-5 py-2.5 text-sm font-bold text-lime-200 transition-colors hover:border-lime-400 hover:bg-lime-500/20 disabled:opacity-60"
    >
      {busy ? "Starting demo…" : "🏈 Try the demo — no signup"}
    </button>
  );
}

export default TryDemoButton;
