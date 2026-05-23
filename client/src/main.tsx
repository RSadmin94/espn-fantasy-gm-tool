import { ClerkProvider } from "@clerk/react-router";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  console.warn("[Clerk] VITE_CLERK_PUBLISHABLE_KEY is not set — auth will not work");
}

const queryClient = new QueryClient();

const isUnauthorizedTrpcError = (error: TRPCClientError<any>) => {
  const data = error.data as { code?: string; httpStatus?: number } | undefined;

  if (data?.code === "UNAUTHORIZED" || data?.httpStatus === 401) return true;
  if (data?.code || data?.httpStatus) return false;

  return error.message === UNAUTHED_ERR_MSG;
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = isUnauthorizedTrpcError(error);

  if (!isUnauthorized) return;

  const redirectUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `/sign-in?redirect_url=${redirectUrl}`;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

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

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY ?? ""}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl="/command-center"
        signUpFallbackRedirectUrl="/command-center"
      >
        <App />
      </ClerkProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </trpc.Provider>
);
