import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import superjson from "superjson";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  useAuth,
} from "@clerk/react-router";
import { AppShell } from "./components/AppShell";
import { ConnectESPN } from "./pages/ConnectESPN";
import { SyncData } from "./pages/SyncData";
import { trpc } from "@/lib/trpc";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

if (!PUBLISHABLE_KEY) {
  console.warn("[Clerk] VITE_CLERK_PUBLISHABLE_KEY is not set — auth will not work");
}

const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

function LoadingSpinner() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn routing="path" path="/sign-in" signUpUrl={undefined} />
    </div>
  );
}

function SSOCallbackPage() {
  return <AuthenticateWithRedirectCallback />;
}

function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingSpinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

// Placeholder page component
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold text-foreground">{title}</h1>
      <p className="mt-4 text-muted-foreground">Coming soon</p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY ?? ""}>
        <Outlet />
      </ClerkProvider>
    ),
    children: [
      { path: "/sign-in", element: <SignInPage /> },
      { path: "/sign-in/*", element: <SignInPage /> },
      { path: "/sso-callback", element: <SSOCallbackPage /> },
      {
        element: <ProtectedLayout />,
        children: [
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <PlaceholderPage title="Dashboard" /> },
          { path: "/connect", element: <ConnectESPN /> },
          { path: "/sync", element: <SyncData /> },
          { path: "/transactions", element: <PlaceholderPage title="Transactions" /> },
          { path: "/standings", element: <PlaceholderPage title="Standings" /> },
          { path: "/roster", element: <PlaceholderPage title="Roster" /> },
          { path: "/trades", element: <PlaceholderPage title="Trades" /> },
          { path: "/advisor", element: <PlaceholderPage title="AI Advisor" /> },
          { path: "/settings", element: <PlaceholderPage title="Settings" /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </trpc.Provider>
);
