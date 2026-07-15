import { afterEach, beforeEach, it, type TestContext } from "vitest";
import type { SleeperIntegrationScope } from "./sleeperIntegrationFixtures";
import {
  cleanupSleeperIntegrationScope,
  isSleeperIntegrationDbAvailable,
} from "./sleeperIntegrationCleanup";

/**
 * Registers guaranteed per-test teardown via Vitest onTestFinished (runs on pass/fail).
 * Pair with a file-local `dbAvailable` flag and pre-test cleanup in beforeEach.
 */
export function registerSleeperIntegrationTeardown(
  scope: SleeperIntegrationScope,
  isDbAvailable: () => boolean,
): void {
  beforeEach(async () => {
    if (isDbAvailable()) {
      await cleanupSleeperIntegrationScope(scope);
    }
  });

  beforeEach((context: TestContext) => {
    const onFinished = (context as TestContext & {
      onTestFinished?: (handler: () => void | Promise<void>) => void;
    }).onTestFinished;
    onFinished?.(async () => {
      if (isDbAvailable()) {
        await cleanupSleeperIntegrationScope(scope);
      }
    });
  });

  afterEach(async () => {
    if (isDbAvailable()) {
      await cleanupSleeperIntegrationScope(scope);
    }
  });
}

export async function prepareSleeperIntegrationTest(
  scope: SleeperIntegrationScope,
): Promise<boolean> {
  const dbAvailable = await isSleeperIntegrationDbAvailable();
  if (dbAvailable) {
    await cleanupSleeperIntegrationScope(scope);
  }
  return dbAvailable;
}
