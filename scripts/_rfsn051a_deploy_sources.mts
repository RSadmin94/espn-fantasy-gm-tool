/**
 * Which git branch does each Railway environment auto-deploy from?
 * Preview and Production share one service, so the branch is per environment
 * and must be confirmed before pushing anything.
 *
 *   pnpm exec tsx scripts/_rfsn051a_deploy_sources.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const PROJECT = "47d8581e-7cee-4ffb-94a4-a15adf753ee7";
const SERVICE = "55c68659-ee4c-4352-98f7-4fff0e4aad87";
const ENVS = [
  { name: "sprint-8-preview", id: "37d11871-454a-4405-a1ec-e91f90f4ad49" },
  { name: "production", id: "87b948fd-810d-4be2-a0b7-651ec0468200" },
];

const cfg = JSON.parse(
  readFileSync(path.join(os.homedir(), ".railway", "config.json"), "utf8"),
) as { user: { accessToken: string } };

async function gql(query: string) {
  const res = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.user.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as any;
}

async function main() {
  for (const env of ENVS) {
    try {
      const d = await gql(
        `query { serviceInstance(serviceId: "${SERVICE}", environmentId: "${env.id}") {
           branch
           source { repo image }
         } }`,
      );
      const si = d.serviceInstance;
      console.log(
        `${env.name.padEnd(18)} branch=${String(si?.branch)}  repo=${String(si?.source?.repo)}`,
      );
    } catch (e) {
      console.log(`${env.name.padEnd(18)} ERROR: ${String(e).slice(0, 200)}`);
    }
  }

  // Most recent deployment per environment, to see what is actually live.
  for (const env of ENVS) {
    try {
      const d = await gql(
        `query { deployments(first: 3, input: {
             projectId: "${PROJECT}", environmentId: "${env.id}", serviceId: "${SERVICE}"
           }) { edges { node { id status createdAt meta staticUrl } } } }`,
      );
      console.log(`\n${env.name} — recent deployments:`);
      for (const e of d.deployments.edges) {
        const m = e.node.meta ?? {};
        console.log(
          `  ${e.node.createdAt}  ${String(e.node.status).padEnd(10)} branch=${m.branch ?? "—"} commit=${String(m.commitHash ?? "—").slice(0, 8)}`,
        );
      }
    } catch (e) {
      console.log(`${env.name} deployments ERROR: ${String(e).slice(0, 200)}`);
    }
  }
  process.exit(0);
}

main();
