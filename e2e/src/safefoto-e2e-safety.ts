import { execFileSync } from 'node:child_process';

type ContainerDetails = {
  State?: { Running?: boolean };
  Config?: { Labels?: Record<string, string> };
  NetworkSettings?: { Ports?: Record<string, { HostPort: string }[] | null> };
};

const inspectDedicatedContainer = (name: string): ContainerDetails => {
  const output = execFileSync('docker', ['inspect', '--type', 'container', name], {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [container] = JSON.parse(output) as ContainerDetails[];
  if (
    !container ||
    container.State?.Running !== true ||
    container.Config?.Labels?.['com.docker.compose.project'] !== 'immich-e2e'
  ) {
    throw new Error('Expected a running, dedicated immich-e2e Compose container');
  }
  return container;
};

/**
 * Fail closed before any resetDatabase() or direct test SQL.
 * This protection is deliberately stronger than checking HTTP :2285 alone.
 */
export const assertSafeFotoE2EDatabase = () => {
  if (process.env.SAFEFOTO_ALLOW_DESTRUCTIVE_E2E !== 'yes-dedicated-e2e-only') {
    throw new Error('SafeFoto E2E reset requires SAFEFOTO_ALLOW_DESTRUCTIVE_E2E=yes-dedicated-e2e-only');
  }
  const url = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://${process.env.PLAYWRIGHT_HOST ?? '127.0.0.1'}:2285`);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '2285') {
    throw new Error('SafeFoto E2E HTTP must be local port 2285');
  }
  if (
    !['127.0.0.1', 'localhost'].includes(process.env.PLAYWRIGHT_DB_HOST ?? '127.0.0.1') ||
    !['127.0.0.1', 'localhost'].includes(process.env.PLAYWRIGHT_HOST ?? '127.0.0.1')
  ) {
    throw new Error('SafeFoto E2E database and API must use local loopback only');
  }
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) {
    throw new Error('Remote Docker daemon is not allowed for SafeFoto E2E');
  }

  const database = inspectDedicatedContainer('immich-e2e-postgres');
  const server = inspectDedicatedContainer('immich-e2e-server');
  if (
    database.Config?.Labels?.['com.docker.compose.service'] !== 'database' ||
    server.Config?.Labels?.['com.docker.compose.service'] !== 'immich-server'
  ) {
    throw new Error('Unexpected E2E Compose services');
  }
  const mappedDb = database.NetworkSettings?.Ports?.['5432/tcp'] ?? [];
  const mappedHttp = server.NetworkSettings?.Ports?.['2285/tcp'] ?? [];
  if (
    !mappedDb.some((port) => port.HostPort === '5435') ||
    !mappedHttp.some((port) => port.HostPort === '2285')
  ) {
    throw new Error('Dedicated E2E ports 5435/2285 do not match their containers');
  }
};
