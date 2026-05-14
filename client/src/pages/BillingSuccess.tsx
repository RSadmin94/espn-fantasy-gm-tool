import { Link } from "wouter";

export default function BillingSuccess() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center space-y-6 rounded-3xl border border-zinc-800 bg-[#111111] p-10 shadow-[0_0_60px_rgba(255,255,255,0.08)]">
        <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">
          Billing Confirmed
        </div>

        <h1 className="text-4xl font-bold">Your League DNA Is Unlocked.</h1>

        <p className="text-zinc-400 leading-relaxed">
          Your subscription is being activated. If your access does not update immediately,
          refresh the app in a few seconds.
        </p>

        <Link href="/command-center">
          <button className="rounded-2xl bg-white px-8 py-4 font-semibold text-black transition-transform hover:scale-[1.02]">
            Go To Command Center
          </button>
        </Link>
      </div>
    </div>
  );
}
