import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};

  // Clerk hooks for auth state and sign-out
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut } = useClerk();

  // tRPC auth.me to get the DB user profile (name, email, role, etc.)
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    // Only fetch when Clerk says user is signed in
    enabled: isLoaded && isSignedIn === true,
  });

  const utils = trpc.useUtils();

  const logout = useCallback(async () => {
    // Clerk handles sign-out client-side; also invalidate the tRPC cache
    await signOut();
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [signOut, utils]);

  const loading = !isLoaded || (isSignedIn === true && meQuery.isLoading);

  const state = useMemo(() => {
    // When Clerk says not signed in, user is null regardless of DB query
    const user = isLoaded && isSignedIn ? (meQuery.data ?? null) : null;
    localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));
    return {
      user,
      loading,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(isLoaded && isSignedIn && meQuery.data),
    };
  }, [isLoaded, isSignedIn, meQuery.data, meQuery.error, loading]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (loading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    loading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
