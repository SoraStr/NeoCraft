import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_PORT, loadListenConfig } from '../src/config';

const originalHost = process.env.HOST;
const originalPort = process.env.PORT;

afterEach(() => {
  setEnv('HOST', originalHost);
  setEnv('PORT', originalPort);
});

describe('loadListenConfig', () => {
  it('uses 3001 as the default API server port', () => {
    delete process.env.HOST;
    delete process.env.PORT;

    expect(loadListenConfig()).toEqual({
      host: '127.0.0.1',
      port: DEFAULT_SERVER_PORT,
    });
  });

  it('allows PORT to override the default API server port', () => {
    process.env.PORT = '4010';

    expect(loadListenConfig().port).toBe(4010);
  });
});

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
