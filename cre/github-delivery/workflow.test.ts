import { describe, expect, test } from 'bun:test';
import type { TeeRuntime } from '@chainlink/cre-sdk';
import { configSchema, initWorkflow, onCronTrigger, type Config } from './workflow.js';

const baseConfig: Config = {
  schedule: '0 0 0 1 1 *',
  requestMode: 'config',
  sourceMode: 'fixture',
  fixtureScenario: 'accepted',
  githubTokenSecretId: 'GITHUB_READ_TOKEN',
  criteriaSecretId: 'DELIVERY_CRITERIA_JSON',
  dealId: '0x716efda684f30ea0b296fca6e3b67f52a92b59bb574d5136d0b178c82030a7d7',
  termsVersion: 1,
  evidenceRevision: 1,
  expiresAt: 2_000_000_000,
  pullNumber: 42,
  submittedSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  chainId: 5_042_002,
  chainSelectorName: 'arc-testnet',
  receiverAddress: '0x0000000000000000000000000000000000000001',
  gasLimit: '500000',
  writeReport: false,
};

function makeRuntime(config: Config) {
  const reports: unknown[] = [];
  const logs: string[] = [];
  const runtime = {
    config,
    now: () => new Date(1_757_000_000_000),
    log: (message: string) => logs.push(message),
    getSecret: () => ({ result: () => ({ value: '' }) }),
    callCapability: () => { throw new Error('fixture mode must not call a provider'); },
    reportFromDon: () => { throw new Error('not used'); },
    usingTheDons: () => ({
      config,
      report: (request: unknown) => {
        reports.push(request);
        return { result: () => ({ rawReport: new Uint8Array() }) };
      },
    }),
  };
  return { runtime: runtime as unknown as TeeRuntime<Config>, reports, logs };
}

describe('confidential GitHub delivery workflow', () => {
  test('keeps fixture simulation independent of production secrets', async () => {
    const settings = await Bun.file(new URL('./workflow.yaml', import.meta.url)).text();
    const [staging, production] = settings.split('production-settings:');

    expect(staging).not.toContain('secrets-path:');
    expect(production).toContain('secrets-path: "../secrets.yaml"');
  });

  test('generates an EVM report without a provider call or broadcast in fixture mode', () => {
    const { runtime, reports, logs } = makeRuntime(baseConfig);
    const output = JSON.parse(onCronTrigger(runtime));

    expect(output).toEqual({
      executionMode: 'simulated-fixture',
      confidentialRuntime: 'handlerInTee-required',
      decisionCode: 'PASS',
      policyVersion: 'github-delivery-v2',
      evidenceRevision: 1,
      reportGenerated: true,
      reportWrite: 'not-broadcast',
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    });
    expect(logs).toEqual([]);
  });

  test('distinguishes mismatch, correction, and unavailable fixture results', () => {
    const mismatch = makeRuntime({
      ...baseConfig,
      fixtureScenario: 'mismatched',
      submittedSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    const corrected = makeRuntime({
      ...baseConfig,
      fixtureScenario: 'corrected',
      submittedSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      evidenceRevision: 2,
    });
    const unavailable = makeRuntime({ ...baseConfig, fixtureScenario: 'unavailable' });

    expect(JSON.parse(onCronTrigger(mismatch.runtime)).decisionCode).toBe('MISMATCH');
    expect(JSON.parse(onCronTrigger(corrected.runtime))).toMatchObject({
      decisionCode: 'PASS',
      evidenceRevision: 2,
    });
    expect(JSON.parse(onCronTrigger(unavailable.runtime)).decisionCode).toBe('UNAVAILABLE');
  });

  test('rejects write-enabled zero-address configuration', () => {
    expect(() => configSchema.parse({
      ...baseConfig,
      writeReport: true,
      receiverAddress: '0x0000000000000000000000000000000000000000',
    })).toThrow('receiverAddress must be deployed');
  });

  test('accepts the production confidential request endpoint', () => {
    const config = configSchema.parse({
      ...baseConfig,
      requestMode: 'confidential-http',
      requestUrl: 'https://api.karwan.site/api/cre/delivery-request/current',
      requestSecretId: 'DELIVERY_REQUEST_TOKEN',
      sourceMode: 'github',
    });

    expect(config.requestUrl).toBe('https://api.karwan.site/api/cre/delivery-request/current');
  });

  test('rejects an expired report before crossing the confidential boundary', () => {
    const { runtime, reports } = makeRuntime({ ...baseConfig, expiresAt: 1_756_999_999 });
    expect(() => onCronTrigger(runtime)).toThrow('EVIDENCE_REPORT_EXPIRED');
    expect(reports).toHaveLength(0);
  });

  test('registers a Nitro us-west-2 TEE handler', () => {
    const handlers = initWorkflow(baseConfig);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]?.fn).toBe(onCronTrigger);
    expect(handlers[0]?.requirements).toBeDefined();
  });

  test('an empty delivery queue is idle and generates no report', () => {
    const { runtime, reports } = makeRuntime({ ...baseConfig, requestMode: 'confidential-http', requestUrl: 'https://api.karwan.site/api/cre/delivery-request/current', requestSecretId: 'DELIVERY_REQUEST_TOKEN' });
    (runtime as unknown as { callCapability: unknown }).callCapability = () => ({ result: () => ({ statusCode: 404, body: new TextEncoder().encode(JSON.stringify({ code: 'CRE_REQUEST_NOT_FOUND' })) }) });
    expect(JSON.parse(onCronTrigger(runtime))).toEqual({ executionMode: 'idle', reportGenerated: false, reportWrite: 'not-broadcast' });
    expect(reports).toHaveLength(0);
  });

  test('authentication and unrelated 404 errors never masquerade as an empty queue', () => {
    for (const statusCode of [401,403,404,500]) {
      const { runtime, reports } = makeRuntime({ ...baseConfig, requestMode: 'confidential-http', requestUrl: 'https://api.karwan.site/api/cre/delivery-request/current', requestSecretId: 'DELIVERY_REQUEST_TOKEN' });
      (runtime as unknown as { callCapability: unknown }).callCapability = () => ({ result: () => ({ statusCode, body: new TextEncoder().encode('{"error":"unavailable"}') }) });
      expect(() => onCronTrigger(runtime)).toThrow('DELIVERY_REQUEST_UNAVAILABLE');
      expect(reports).toHaveLength(0);
    }
  });
});
