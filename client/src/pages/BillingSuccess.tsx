import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BillingSuccess() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/command-center");
    }, 4000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">You're in the War Room.</h1>
          <p className="text-zinc-400 text-sm">
            Full access unlocked. Your GM intelligence suite is ready.
          </p>
        </div>
        <p className="text-zinc-600 text-xs">Redirecting to Command Center…</p>
        <button
          onClick={() => navigate("/command-center")}
          className="px-6 py-2.5 rounded-lg bg-white text-[#0a0a0a] text-sm font-semibold hover:bg-white/90 transition-colors"
        >
          Go Now →
        </button>
      </div>
    </div>
  );
}
