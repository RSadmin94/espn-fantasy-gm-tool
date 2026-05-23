import { useNavigate } from "react-router";

export default function BillingCancel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-zinc-800/60 border border-zinc-700/40 flex items-center justify-center">
          <svg className="w-10 h-10 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">No worries.</h1>
          <p className="text-zinc-400 text-sm">
            Your league DNA is still waiting. Come back when you're ready.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate("/reveal")}
            className="px-6 py-2.5 rounded-lg bg-white text-[#0a0a0a] text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Back to My League DNA
          </button>
          <button
            onClick={() => navigate("/command-center")}
            className="px-6 py-2.5 rounded-lg bg-transparent border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-zinc-500 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
