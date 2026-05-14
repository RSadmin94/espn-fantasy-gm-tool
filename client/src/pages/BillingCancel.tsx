import { Link } from "wouter";

export default function BillingCancel() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-6">
      <div className="max-w-xl w-full text-center space-y-6 rounded-3xl border border-zinc-800 bg-[#111111] p-10">
        <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">
          Checkout Canceled
        </div>

        <h1 className="text-4xl font-bold">Your League Intelligence Is Still Waiting.</h1>

        <p className="text-zinc-400 leading-relaxed">
          Your checkout session was canceled before activation. You can return to your reveal and unlock the full intelligence network anytime.
        </p>

        <Link href="/reveal">
          <button className="rounded-2xl bg-white px-8 py-4 font-semibold text-black transition-transform hover:scale-[1.02]">
            Return To Reveal
          </button>
        </Link>
      </div>
    </div>
  );
}
