import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { clerkMiddleware } from "@clerk/express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { espnRefreshHandler } from "../scheduledRefresh";
import { weeklyIntelHandler } from "../weeklyIntelHandler";
import { registerAdvisorStreamRoute } from "../advisorStreamHandler";
import { registerStripeWebhook } from "../stripeWebhook";
import { registerHealthRoute } from "./healthRoute";
import { ENV } from "./env";

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Stripe webhook MUST be registered before express.json() to preserve raw body for signature verification
  registerStripeWebhook(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Clerk auth middleware — reads session token from cookie/header, populates getAuth(req)
  app.use(clerkMiddleware({
    authorizedParties: ["https://gmwarroom.online"],
    publishableKey: ENV.clerkPublishableKey || undefined,
    secretKey: ENV.clerkSecretKey || undefined,
  }));

  registerHealthRoute(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Streaming advisor SSE endpoint — must be before Vite/static fallthrough
  registerAdvisorStreamRoute(app);
  // Scheduled job handlers — must be before Vite/static fallthrough
  app.post("/api/scheduled/espn-refresh", espnRefreshHandler);
  app.post("/api/scheduled/weekly-intel", weeklyIntelHandler);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
