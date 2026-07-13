import { Resolver } from "node:dns/promises";

const resolver = new Resolver();
resolver.setServers(["8.8.8.8", "1.1.1.1"]);

export async function resolveHostIp(hostname: string): Promise<string> {
  try {
    const a = await resolver.resolve4(hostname);
    if (a[0]) return a[0];
  } catch {
    // fall through
  }
  const cnames = await resolver.resolveCname(hostname);
  const a = await resolver.resolve4(cnames[0]!);
  return a[0]!;
}

export function chromiumHostRule(hostname: string, ip: string): string {
  return `MAP ${hostname} ${ip}`;
}
