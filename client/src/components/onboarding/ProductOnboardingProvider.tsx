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
  dismissWelcome,
  isOnboardingComplete,
  markFirstSyncSuccess,
  shouldShowWelcome,
  type ProductTourStepId,
} from "@/lib/productOnboarding";
import { WelcomeModal } from "./WelcomeModal";
import { ProductTour } from "./ProductTour";

type ProductOnboardingContextValue = {
  notifyLeagueSyncSuccess: () => void;
  startTour: (stepId?: ProductTourStepId) => void;
  isComplete: boolean;
};

const ProductOnboardingContext = createContext<ProductOnboardingContextValue | null>(null);

export function useProductOnboarding(): ProductOnboardingContextValue {
  const ctx = useContext(ProductOnboardingContext);
  if (!ctx) {
    return {
      notifyLeagueSyncSuccess: () => {},
      startTour: () => {},
      isComplete: true,
    };
  }
  return ctx;
}

export function ProductOnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { leagueId } = useLeagueContext();
  const userId = user?.id;

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepId, setTourStepId] = useState<ProductTourStepId | undefined>();
  const [complete, setComplete] = useState(() => isOnboardingComplete(userId, leagueId));

  useEffect(() => {
    if (!isLoaded) return;
    setComplete(isOnboardingComplete(userId, leagueId));
    if (shouldShowWelcome(userId, leagueId)) setWelcomeOpen(true);
  }, [isLoaded, userId, leagueId]);

  const persistComplete = useCallback(() => {
    if (!userId || !leagueId) return;
    completeOnboarding(userId, leagueId);
    setComplete(true);
    setWelcomeOpen(false);
    setTourOpen(false);
  }, [userId, leagueId]);

  const notifyLeagueSyncSuccess = useCallback(() => {
    if (!userId || !leagueId) return;
    markFirstSyncSuccess(userId, leagueId);
    if (shouldShowWelcome(userId, leagueId)) setWelcomeOpen(true);
  }, [userId, leagueId]);

  const startTour = useCallback((stepId?: ProductTourStepId) => {
    setTourStepId(stepId);
    setTourOpen(true);
  }, []);

  const handleExplore = useCallback(
    (stepId: ProductTourStepId) => {
      if (!userId || !leagueId) return;
      dismissWelcome(userId, leagueId);
      setWelcomeOpen(false);
      startTour(stepId);
    },
    [userId, leagueId, startTour],
  );

  const value = useMemo(
    () => ({
      notifyLeagueSyncSuccess,
      startTour,
      isComplete: complete,
    }),
    [notifyLeagueSyncSuccess, startTour, complete],
  );

  return (
    <ProductOnboardingContext.Provider value={value}>
      {children}
      <WelcomeModal
        open={welcomeOpen}
        onOpenChange={setWelcomeOpen}
        onExplore={handleExplore}
        onSkipTour={persistComplete}
      />
      <ProductTour
        open={tourOpen}
        initialStepId={tourStepId}
        onOpenChange={setTourOpen}
        onComplete={persistComplete}
        onSkip={persistComplete}
      />
    </ProductOnboardingContext.Provider>
  );
}
