/** Shared founder auth helpers for browser certification (not committed to app bundle). */
import { type BrowserContext, type Page } from "playwright";

const PROD_ORIGIN = "https://fantasyfootballrivals.com";
const FOUNDER_CLERK_ID = process.env.FOUNDER_CLERK_ID ?? "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo";

export function isClerkAllowedHost(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === "fantasyfootballrivals.com" || host.endsWith(".fantasyfootballrivals.com");
  } catch {
    return false;
  }
}

export async function mintFounderTicketUrl(base: string): Promise<string> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY required — run mint via railway run");
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: FOUNDER_CLERK_ID, expires_in_seconds: 600 }),
  });
  if (!res.ok) throw new Error(`Clerk sign-in token mint failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Clerk sign-in token missing");
  return `${base.replace(/\/$/, "")}/sign-in?__clerk_ticket=${encodeURIComponent(data.token)}`;
}

async function waitForClerkUser(page: Page): Promise<void> {
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const userId = await page.evaluate(() => {
      const w = window as unknown as { Clerk?: { user?: { id?: string } | null } };
      return w.Clerk?.user?.id ?? null;
    });
    if (userId) return;
  }
  throw new Error("Clerk sign-in did not complete (no user id after 25s)");
}

export async function signInFounderOnPage(page: Page, base: string): Promise<void> {
  const signInUrl = await mintFounderTicketUrl(base);
  await page.goto(signInUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForClerkUser(page);
}

export async function signInFounderForPreview(context: BrowserContext, previewBase: string): Promise<Page> {
  if (isClerkAllowedHost(previewBase)) {
    const page = await context.newPage();
    await signInFounderOnPage(page, previewBase);
    return page;
  }

  // Clerk production keys reject *.railway.app in the browser. Sign in on the primary domain,
  // then reuse the session JWT against the preview host (requires preview DATABASE_URL = production).
  const prodContext = await context.browser()!.newContext();
  const prodPage = await prodContext.newPage();
  await signInFounderOnPage(prodPage, PROD_ORIGIN);
  const jwt = await prodPage.evaluate(async () => {
    const w = window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } };
    return (await w.Clerk?.session?.getToken()) ?? null;
  });
  await prodContext.close();
  if (!jwt) throw new Error("Could not read Clerk session JWT after production sign-in");

  const host = new URL(previewBase).hostname;
  await context.addCookies([
    {
      name: "__session",
      value: jwt,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await context.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    const headers = { ...req.headers(), authorization: `Bearer ${jwt}` };
    await route.continue({ headers });
  });

  const page = await context.newPage();
  await page.goto(`${previewBase.replace(/\/$/, "")}/draft-war-room`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  return page;
}
