import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

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

  window.location.href = getLoginUrl();
};

const createQueryClient = () => {
  const client = new QueryClient();

  client.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "error") {
      const error = event.query.state.error;
      redirectToLoginIfUnauthorized(error);
      console.error("[API Query Error]", error);
    }
  });

  client.getMutationCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "error") {
      const error = event.mutation.state.error;
      redirectToLoginIfUnauthorized(error);
      console.error("[API Mutation Error]", error);
    }
  });

  return client;
};

const createTrpcClient = (getToken: () => Promise<string | null>) => trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const token = await getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

function TrpcProviderRoot() {
  const { getToken } = useAuth();
  const [queryClient] = useState(createQueryClient);
  const trpcClient = useMemo(
    () => createTrpcClient(() => getToken()),
    [getToken]
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} signInUrl="/sign-in">
    <TrpcProviderRoot />
  </ClerkProvider>
);
