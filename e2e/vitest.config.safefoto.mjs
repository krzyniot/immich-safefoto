import { defineConfig } from 'vitest/config';

/**
 * SafeFoto-only test suite.
 * Unlike vitest.config.ts this config NEVER invokes Docker Compose automatically.
 * Running it still requires an explicit opt-in and a verified dedicated E2E database.
 */
export default defineConfig({
  test: {
    name: 'safefoto:e2e:isolated',
    include: [
      'src/specs/server/api/safefoto-family-http-revocation.e2e-spec.ts',
      'src/safefoto-e2e-safety.spec.ts',
    ],
    maxWorkers: 1,
    isolate: false,
    testTimeout: 20_000,
    hookTimeout: 65_000,
  },
  resolve: { tsconfigPaths: true },
});
