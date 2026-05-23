import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
} from "@clerk/clerk-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";

export const AUTH_PATHS = {
  signIn: "/sign-in",
  signUp: "/sign-up",
  ssoCallback: "/sso-callback",
  afterSignIn: "/command-center",
} as const;

function getClerkPublishableKey(): string {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  }

  return key;
}

function centeredPage(children: ReactNode) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      {children}
    </div>
  );
}

function buildRedirectUrl() {
  return encodeURIComponent(`${window.location.pathname}${window.location.search}`);
}

export function AppClerkProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={getClerkPublishableKey()}
      signInUrl={AUTH_PATHS.signIn}
      signUpUrl={AUTH_PATHS.signUp}
    >
      {children}
    </ClerkProvider>
  );
}

export function SignInPage() {
  return centeredPage(
    <SignIn
      routing="path"
      path={AUTH_PATHS.signIn}
      signUpUrl={AUTH_PATHS.signUp}
      fallbackRedirectUrl={AUTH_PATHS.afterSignIn}
    />
  );
}

export function SignUpPage() {
  return centeredPage(
    <SignUp
      routing="path"
      path={AUTH_PATHS.signUp}
      signInUrl={AUTH_PATHS.signIn}
      fallbackRedirectUrl={AUTH_PATHS.afterSignIn}
    />
  );
}

export function SsoCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl={AUTH_PATHS.afterSignIn}
      signUpFallbackRedirectUrl={AUTH_PATHS.afterSignIn}
    />
  );
}

export function AuthLoadingPage() {
  return centeredPage(<span>Loading...</span>);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;

    navigate(`${AUTH_PATHS.signIn}?redirect_url=${buildRedirectUrl()}`, { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded) return <AuthLoadingPage />;
  if (!isSignedIn) return null;

  return <>{children}</>;
}

export function AuthRoutes({ children }: { children: ReactNode }) {
  return (
    <Switch>
      <Route path={/^\/sign-in(?:\/.*)?$/} component={SignInPage} />
      <Route path={/^\/sign-up(?:\/.*)?$/} component={SignUpPage} />
      <Route path={AUTH_PATHS.ssoCallback} component={SsoCallbackPage} />
      <Route component={() => <RequireAuth>{children}</RequireAuth>} />
    </Switch>
  );
}
