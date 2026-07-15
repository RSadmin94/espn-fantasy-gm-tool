/** Paywall headline + body — single source for custom paywall panels. */
export function resolvePaywallCopy(
  heading: string,
  description: string,
): { heading: string; description: string } {
  return { heading, description };
}
