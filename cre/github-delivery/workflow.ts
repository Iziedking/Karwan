import {
  cre,
  getNetwork,
  ok,
  prepareReportRequest,
  text,
  type TeeRuntime,
} from '@chainlink/cre-sdk';
import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  parseAbiParameters,
  toBytes,
  type Address,
  type Hex,
} from 'viem';
import { z } from 'zod';
import {
  evaluateGitHubDelivery,
  type GitHubDeliveryResult,
} from '../../backend/src/evidence/githubDeliveryPredicate.js';
import { creDeliveryReportId } from '../../backend/src/evidence/creReportIdentity.js';
import { loadFixtureEvidence } from './fixtureSource.js';
import { confidentialCriteriaSchema, loadGitHubEvidence } from './githubSource.js';

const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const shaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/);
// CRE CLI v1.33.0's WASM validator rejects this valid HTTPS endpoint when
// the standard Zod URL check is used. Keep the boundary strict for HTTP(S)
// without depending on the simulator's URL implementation. Verified 2026-09-11.
const httpUrlSchema = z.string().regex(/^https?:\/\/[^\s]+$/i, 'requestUrl must be an absolute HTTP(S) URL');

export const configSchema = z.object({
  schedule: z.string().min(1),
  /// `config` is deterministic local fixture input. `confidential-http`
  /// keeps mutable deal/delivery inputs out of the workflow identity and
  /// loads the authenticated request inside the TEE.
  requestMode: z.enum(['config', 'confidential-http']).default('config'),
  requestUrl: httpUrlSchema.optional(),
  requestSecretId: z.string().min(1).optional(),
  sourceMode: z.enum(['fixture', 'github']),
  fixtureScenario: z.enum(['accepted', 'mismatched', 'corrected', 'unavailable']).optional(),
  githubTokenSecretId: z.string().min(1),
  criteriaSecretId: z.string().min(1),
  dealId: bytes32Schema.optional(),
  termsVersion: z.number().int().positive().optional(),
  evidenceRevision: z.number().int().positive().optional(),
  expiresAt: z.number().int().positive().optional(),
  pullNumber: z.number().int().positive().optional(),
  submittedSha: shaSchema.optional(),
  chainId: z.literal(5_042_002),
  chainSelectorName: z.literal('arc-testnet'),
  receiverAddress: z.string().refine(isAddress),
  gasLimit: z.string().regex(/^[1-9][0-9]*$/),
  writeReport: z.boolean(),
}).strict().superRefine((config, context) => {
  if (config.sourceMode === 'fixture' && !config.fixtureScenario) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'fixtureScenario is required in fixture mode' });
  }
  if (config.writeReport && config.receiverAddress === '0x0000000000000000000000000000000000000000') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'receiverAddress must be deployed before writes are enabled' });
  }
  if (config.requestMode === 'confidential-http') {
    if (!config.requestUrl || !config.requestSecretId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'confidential-http mode requires requestUrl and requestSecretId' });
    }
  } else if (
    !config.dealId
    || config.termsVersion === undefined
    || config.evidenceRevision === undefined
    || config.expiresAt === undefined
    || config.pullNumber === undefined
    || !config.submittedSha
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'config request mode requires deal and delivery inputs' });
  }
});

export type Config = z.infer<typeof configSchema>;

const deliveryRequestSchema = z.object({
  dealId: bytes32Schema,
  termsVersion: z.number().int().positive(),
  evidenceRevision: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  pullNumber: z.number().int().positive(),
  submittedSha: shaSchema,
  leaseToken: z.string().uuid().optional(),
}).strict();

type DeliveryRequest = z.infer<typeof deliveryRequestSchema>;

const REPORT_DOMAIN = keccak256(toBytes('karwan.evidence.github.v1'));
const decisionNumber = (decision: GitHubDeliveryResult['decisionCode']): number => (
  decision === 'PASS' ? 1 : decision === 'MISMATCH' ? 2 : 3
);

function buildReportPayload(config: Config, request: DeliveryRequest, result: GitHubDeliveryResult): Hex {
  const evidenceCommitment = `0x${result.evidenceDigest}` as Hex;
  const criteriaCommitment = `0x${result.criteriaDigest}` as Hex;
  const decisionCode = decisionNumber(result.decisionCode);
  const verdictCommitment = keccak256(encodeAbiParameters(
    parseAbiParameters('string policyVersion, bytes32 criteriaCommitment, bytes32 evidenceCommitment, uint8 decisionCode'),
    [result.policyVersion, criteriaCommitment, evidenceCommitment, decisionCode],
  ));
  const reportId = creDeliveryReportId({
    dealId: request.dealId as `0x${string}`,
    termsVersion: request.termsVersion,
    evidenceRevision: request.evidenceRevision,
    evidenceCommitment: evidenceCommitment as `0x${string}`,
    verdictCommitment: verdictCommitment as `0x${string}`,
    decisionCode,
    leaseToken: request.leaseToken,
  });

  return encodeAbiParameters(
    parseAbiParameters('bytes32 domain, uint256 chainId, bytes32 dealId, uint64 termsVersion, uint64 evidenceRevision, uint64 expiresAt, bytes32 evidenceCommitment, bytes32 verdictCommitment, uint8 decisionCode, bytes32 reportId'),
    [
      REPORT_DOMAIN,
      BigInt(config.chainId),
      request.dealId as Hex,
      BigInt(request.termsVersion),
      BigInt(request.evidenceRevision),
      BigInt(request.expiresAt),
      evidenceCommitment,
      verdictCommitment,
      decisionCode,
      reportId,
    ],
  );
}

function loadDeliveryRequest(runtime: TeeRuntime<Config>, config: Config): DeliveryRequest {
  if (config.requestMode !== 'confidential-http') {
    return deliveryRequestSchema.parse({
      dealId: config.dealId,
      termsVersion: config.termsVersion,
      evidenceRevision: config.evidenceRevision,
      expiresAt: config.expiresAt,
      pullNumber: config.pullNumber,
      submittedSha: config.submittedSha,
    });
  }
  const response = new cre.capabilities.HTTPClient().sendRequest(runtime, {
    url: config.requestUrl!,
    method: 'GET',
    multiHeaders: {
      Accept: { values: ['application/json'] },
      Authorization: { values: [`Bearer ${runtime.getSecret({ id: config.requestSecretId! }).result().value}`] },
      'User-Agent': { values: ['karwan-cre-delivery-request'] },
    },
  }).result();
  if (!ok(response)) throw new Error('DELIVERY_REQUEST_UNAVAILABLE');
  return deliveryRequestSchema.parse(JSON.parse(text(response)));
}

export function onCronTrigger(runtime: TeeRuntime<Config>): string {
  const config = runtime.config;
  const request = loadDeliveryRequest(runtime, config);
  if (request.expiresAt <= Math.floor(runtime.now().getTime() / 1_000)) {
    throw new Error('EVIDENCE_REPORT_EXPIRED');
  }
  const source = config.sourceMode === 'fixture'
    ? loadFixtureEvidence(
        config.fixtureScenario!,
        Math.floor(runtime.now().getTime() / 1_000),
        request.submittedSha,
      )
    : loadGitHubEvidence(
        runtime,
        confidentialCriteriaSchema.parse(JSON.parse(
          runtime.getSecret({ id: config.criteriaSecretId }).result().value,
        )),
        runtime.getSecret({ id: config.githubTokenSecretId }).result().value,
        request.pullNumber,
        request.submittedSha,
      );
  const result = evaluateGitHubDelivery(source.criteria, source.evidence);
  const payload = buildReportPayload(config, request, result);

  // This is the sole confidentiality boundary crossing. Raw criteria, GitHub
  // responses, credentials, identities, repository names and SHAs stay in TEE.
  const donRuntime = runtime.usingTheDons();
  const report = donRuntime.report(prepareReportRequest(payload)).result();

  let reportWrite = 'not-broadcast';
  if (config.writeReport) {
    const network = getNetwork({
      chainFamily: 'evm',
      chainSelectorName: config.chainSelectorName,
      isTestnet: true,
    });
    if (!network) throw new Error('ARC_TESTNET_NOT_SUPPORTED_BY_SDK');
    if (Number(network.chainId) !== config.chainId) {
      throw new Error('ARC_TESTNET_CHAIN_ID_MISMATCH');
    }
    new cre.capabilities.EVMClient(network.chainSelector.selector).writeReport(donRuntime, {
      // `writeReport` accepts the JSON form of the receiver as a hex address.
      // The SDK converts it to bytes internally; passing base64 here makes
      // that conversion try to parse the base64 text as hexadecimal.
      receiver: config.receiverAddress as Address,
      report,
      gasConfig: { gasLimit: config.gasLimit },
    }).result();
    reportWrite = 'write-capability-invoked';
  }

  return JSON.stringify({
    executionMode: config.sourceMode === 'fixture' ? 'simulated-fixture' : 'github-source',
    confidentialRuntime: 'handlerInTee-required',
    decisionCode: result.decisionCode,
    policyVersion: result.policyVersion,
    evidenceRevision: request.evidenceRevision,
    reportGenerated: true,
    reportWrite,
  });
}

export function initWorkflow(config: Config) {
  const cronTrigger = new cre.capabilities.CronCapability();
  return [cre.handlerInTee(
    cronTrigger.trigger({ schedule: config.schedule }),
    onCronTrigger,
    [{ tee: 'nitro', regions: ['us-west-2'] }],
  )];
}

export const workflowBoundary = {
  reportDomain: REPORT_DOMAIN,
  tee: 'nitro',
  region: 'us-west-2',
  githubApiRoot: 'https://api.github.com',
} as const;
