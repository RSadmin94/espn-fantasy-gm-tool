import { config } from "dotenv";
import path from "node:path";
import { aliasClerkPublishableKey } from "./clerkEnv";

/**
 * Load local env files in the same override order Vite uses for the client:
 * `.env` then `.env.local` (later wins). Platform env vars already on
 * `process.env` are not overwritten by `.env`.
 *
 * `.env.local` override is development-only so a leftover file cannot clobber
 * Railway/production secrets.
 */
config();

if (process.env.NODE_ENV === "development") {
  config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
}

aliasClerkPublishableKey();
