import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/react-router";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import {
  completeOnboarding,
  isOnboardingComplete,
  markFirstSyncSuccess,
  shouldShowWelcome,
} from "@/lib/productOnboarding";
import { LeagueRevealModal } from "./LeagueRevealModal";

type ProductOnboardingContextValue = {
  notifyLeagueSyncSuccess: () => void;
  isComplete: boolean;
};

const ProductOnboardingContext = createContext<ProductOnboardingContextValue | null>(null);

export function useProductOnboarding(): ProductOnboardingContextValue {
  const ctx = useContext(ProductOnboardingContext);
  if (!ctx) {
    return {
      notifyLeagueSyncSuccess: () => {},
      isComplete: true,
    };
  }
  return ctx;
}

export function ProductOnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { leagueId } = useLeagueContext();
  const userId = user?.id;

  const [revealOpen, setRevealOpen] = useState(false);
  const [complete, setComplete] = useState(() => isOnboardingComplete(userId, leagueId));

  useEffect(() => {
    if (!isLoaded) return;
    setComplete(isOnboardingComplete(userId, leagueId));
    if (shouldShowWelcome(userId, leagueId)) setRevealOpen(true);
  }, [isLoaded, userId, leagueId]);

  const persistComplete = useCallback(() => {
    if (!userId || !leagueId) return;
    completeOnboarding(userId, leagueId);
    setComplete(true);
    setRevealOpen(false);
  }, [userId, leagueId]);

  const notifyLeagueSyncSuccess = useCallback(() => {
    if (!userId || !leagueId) return;
    markFirstSyncSuccess(userId, leagueId);
    if (shouldShowWelcome(userId, leagueId)) setRevealOpen(true);
  }, [userId, leagueId]);

  const value = useMemo(
    () => ({
      notifyLeagueSyncSuccess,
      isComplete: complete,
    }),
    [notifyLeagueSyncSuccess, complete],
  );

  return (
    <ProductOnboardingContext.Provider value={value}>
      {children}
      <LeagueRevealModal open={revealOpen} onOpenChange={setRevealOpen} onComplete={persistComplete} />
    </ProductOnboardingContext.Provider>
  );
}
