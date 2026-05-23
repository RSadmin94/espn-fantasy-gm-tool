import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
} from "@clerk/clerk-react";
import type { ReactNode } from "react";
import { Route, Switch } from "wouter";

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

  if (!isLoaded) return <AuthLoadingPage />;
  
  if (!isSignedIn) {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`${AUTH_PATHS.signIn}?redirect_url=${returnUrl}`);
    return <AuthLoadingPage />;
  }

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
