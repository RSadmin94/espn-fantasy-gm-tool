import { useState } from "react";
import { useClerk } from "@clerk/react-router";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * One-click "Try Demo".
 *
 * Mints a Clerk sign-in ticket server-side (demo.start) and completes sign-in with Clerk's
 * standard `ticket` strategy via the Clerk instance from useClerk() — landing the visitor in
 * the read-only demo account. No signup, no ESPN, no password in the browser.
 *
 * NOTE: uses useClerk() from @clerk/react-router (the SAME package as the app's <ClerkProvider>)
 * and the low-level client.signIn API, rather than useSignIn from @clerk/clerk-react — mixing
 * packages breaks the provider context at runtime.
 */
export function TryDemoButton() {
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const start = trpc.demo.start.useMutation();

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const { ticket } = await start.mutateAsync();
      const client = clerk.client;
      if (!client) throw new Error("not-ready");
      const res = await client.signIn.create({ strategy: "ticket", ticket });
      if (res.status === "complete" && res.createdSessionId) {
        await clerk.setActive({ session: res.createdSessionId });
        // Hard-navigate so the /sign-in page (and its Clerk <SignIn fallbackRedirectUrl="/connect">,
        // which would otherwise redirect the just-signed-in demo to /connect) is fully unmounted.
        // The demo must always land on the dashboard, never onboarding. A full load also picks up
        // the demo's league context (457622) cleanly.
        window.location.replace("/dashboard");
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
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-lime-500/40 bg-lime-500/10 px-5 py-2.5 text-sm font-bold text-lime-200 transition-colors hover:border-lime-400 hover:bg-lime-500/20 disabled:opacity-60"
    >
      {busy ? "Starting demo…" : "🏈 Try the demo — no signup"}
    </button>
  );
}

export default TryDemoButton;
