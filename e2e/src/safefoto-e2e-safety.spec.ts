import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSafeFotoE2EDatabase } from 'src/safefoto-e2e-safety';

describe('SafeFoto E2E destructive-operation guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects database reset unless explicitly opted in', () => {
    vi.stubEnv('SAFEFOTO_ALLOW_DESTRUCTIVE_E2E', '');
    expect(() => assertSafeFotoE2EDatabase()).toThrow('requires SAFEFOTO_ALLOW_DESTRUCTIVE_E2E');
  });

  it('rejects incorrect API endpoints even with opt-in', () => {
    vi.stubEnv('SAFEFOTO_ALLOW_DESTRUCTIVE_E2E', 'yes-dedicated-e2e-only');
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://127.0.0.1:13013');
    expect(() => assertSafeFotoE2EDatabase()).toThrow('must be local port 2285');
  });

  it('rejects remote database addresses', () => {
    vi.stubEnv('SAFEFOTO_ALLOW_DESTRUCTIVE_E2E', 'yes-dedicated-e2e-only');
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://127.0.0.1:2285');
    vi.stubEnv('PLAYWRIGHT_DB_HOST', '192.168.0.188');
    expect(() => assertSafeFotoE2EDatabase()).toThrow('local loopback only');
  });

  it('rejects remote docker daemons', () => {
    vi.stubEnv('SAFEFOTO_ALLOW_DESTRUCTIVE_E2E', 'yes-dedicated-e2e-only');
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://127.0.0.1:2285');
    vi.stubEnv('PLAYWRIGHT_DB_HOST', '127.0.0.1');
    vi.stubEnv('PLAYWRIGHT_HOST', '127.0.0.1');
    vi.stubEnv('DOCKER_HOST', 'tcp://other-host:2376');
    expect(() => assertSafeFotoE2EDatabase()).toThrow('Remote Docker daemon');
  });
});
