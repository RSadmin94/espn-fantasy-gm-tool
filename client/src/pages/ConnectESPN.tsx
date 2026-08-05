import { AdvancedConnectPanel } from "@/components/connect/espn/AdvancedConnectPanel";
import { EspnConnectFlow } from "@/components/connect/espn/EspnConnectFlow";

/**
 * One guided path to a connected ESPN league. The page asks a single question at a time and the
 * connector answers it; everything else lives behind Advanced.
 */
export function ConnectESPN() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-4 sm:py-8">
      <EspnConnectFlow />
      <AdvancedConnectPanel />
    </div>
  );
}
