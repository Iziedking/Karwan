import {
  cre,
  getNetwork,
  hexToBase64,
  prepareReportRequest,
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
import { loadFixtureEvidence } from './fixtureSource.js';
import { confidentialCriteriaSchema, loadGitHubEvidence } from './githubSource.js';

const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const shaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/);

export const configSchema = z.object({
  schedule: z.string().min(1),
  sourceMode: z.enum(['fixture', 'github']),
  fixtureScenario: z.enum(['accepted', 'mismatched', 'corrected', 'unavailable']).optional(),
  githubTokenSecretId: z.string().min(1),
  criteriaSecretId: z.string().min(1),
  dealId: bytes32Schema,
  termsVersion: z.number().int().positive(),
  evidenceRevision: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  pullNumber: z.number().int().positive(),
  submittedSha: shaSchema,
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
});

export type Config = z.infer<typeof configSchema>;

const REPORT_DOMAIN = keccak256(toBytes('karwan.evidence.github.v1'));
const decisionNumber = (decision: GitHubDeliveryResult['decisionCode']): number => (
  decision === 'PASS' ? 1 : decision === 'MISMATCH' ? 2 : 3
);

function buildReportPayload(config: Config, result: GitHubDeliveryResult): Hex {
  const evidenceCommitment = `0x${result.evidenceDigest}` as Hex;
  const criteriaCommitment = `0x${result.criteriaDigest}` as Hex;
  const decisionCode = decisionNumber(result.decisionCode);
  const verdictCommitment = keccak256(encodeAbiParameters(
    parseAbiParameters('string policyVersion, bytes32 criteriaCommitment, bytes32 evidenceCommitment, uint8 decisionCode'),
    [result.policyVersion, criteriaCommitment, evidenceCommitment, decisionCode],
  ));
  const reportId = keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32 dealId, uint64 termsVersion, uint64 evidenceRevision, bytes32 evidenceCommitment, bytes32 verdictCommitment, uint8 decisionCode'),
    [config.dealId as Hex, BigInt(config.termsVersion), BigInt(config.evidenceRevision), evidenceCommitment, verdictCommitment, decisionCode],
  ));

  return encodeAbiParameters(
    parseAbiParameters('bytes32 domain, uint256 chainId, bytes32 dealId, uint64 termsVersion, uint64 evidenceRevision, uint64 expiresAt, bytes32 evidenceCommitment, bytes32 verdictCommitment, uint8 decisionCode, bytes32 reportId'),
    [
      REPORT_DOMAIN,
      BigInt(config.chainId),
      config.dealId as Hex,
      BigInt(config.termsVersion),
      BigInt(config.evidenceRevision),
      BigInt(config.expiresAt),
      evidenceCommitment,
      verdictCommitment,
      decisionCode,
      reportId,
    ],
  );
}

export function onCronTrigger(runtime: TeeRuntime<Config>): string {
  const config = runtime.config;
  if (config.expiresAt <= Math.floor(runtime.now().getTime() / 1_000)) {
    throw new Error('EVIDENCE_REPORT_EXPIRED');
  }
  const source = config.sourceMode === 'fixture'
    ? loadFixtureEvidence(
        config.fixtureScenario!,
        Math.floor(runtime.now().getTime() / 1_000),
        config.submittedSha,
      )
    : loadGitHubEvidence(
        runtime,
        confidentialCriteriaSchema.parse(JSON.parse(
          runtime.getSecret({ id: config.criteriaSecretId }).result().value,
        )),
        runtime.getSecret({ id: config.githubTokenSecretId }).result().value,
        config.pullNumber,
        config.submittedSha,
      );
  const result = evaluateGitHubDelivery(source.criteria, source.evidence);
  const payload = buildReportPayload(config, result);

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
      receiver: hexToBase64(config.receiverAddress as Address),
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
    evidenceRevision: config.evidenceRevision,
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
