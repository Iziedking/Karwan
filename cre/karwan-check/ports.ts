import {
  bytesToBase64,
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  text,
  TxStatus,
  type HTTPSendRequester,
  type Runtime,
} from '@chainlink/cre-sdk';
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  toBytes,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { canonicalJson } from '../shared/canonical.js';
import { agreementAbi } from '../shared/suiteAbi.js';
import type { RunFacts } from '../shared/verdict.js';
import type { CheckPorts, DispatchArgs, PendingItem } from './check.js';

const GITHUB_API = 'https://api.github.com';
const RUNNER_WORKFLOW = '.github/workflows/replay.yml';
const MAX_BODY_BYTES = 512_000;
/// ReceiverContractExecutionStatus.SUCCESS (not exported for EVM by the SDK).
/// The forwarder never reverts, so a write counts only when the receiver ran.
const RECEIVER_SUCCESS = 0;
const DELIVERED_TOPIC = '0xd45beba397c83fdda516d54bb097da4de94910b65c27d164acabb48abe741efc' as Hex;

export interface PortsConfig {
  chainSelectorName: string;
  karwanApi: string;
  apiTokenSecretId: string;
  githubTokenSecretId: string;
  runnerRef: string;
  gasLimit: string;
  adapter: string;
}

interface Fetched {
  status: number;
  body: string;
}

/// Every node makes the call and returns only what the rules need, as one
/// canonical string, so identical aggregation compares facts, not raw bodies.
function nodeGet(runtime: Runtime<unknown>, url: string, headers: Record<string, string>, extract: (f: Fetched) => unknown): unknown {
  const http = new cre.capabilities.HTTPClient();
  const agreed = http.sendRequest(
    runtime,
    (sender: HTTPSendRequester, u: string) => {
      const response = sender.sendRequest({ url: u, method: 'GET', multiHeaders: multi(headers) }).result();
      const body = text(response);
      if (body.length > MAX_BODY_BYTES) return canonicalJson(extract({ status: 0, body: '' }));
      return canonicalJson(extract({ status: response.statusCode, body }));
    },
    consensusIdenticalAggregation<string>(),
  )(url).result();
  return JSON.parse(agreed);
}

/// A write with a side effect: one node sends it, the others reuse its
/// response from the capability cache, so a dispatch happens once.
function nodePost(runtime: Runtime<unknown>, url: string, headers: Record<string, string>, payload: unknown): number {
  const http = new cre.capabilities.HTTPClient();
  return http.sendRequest(
    runtime,
    (sender: HTTPSendRequester, u: string) => {
      const response = sender.sendRequest({
        url: u,
        method: 'POST',
        multiHeaders: multi({ ...headers, 'Content-Type': 'application/json' }),
        body: bytesToBase64(toBytes(canonicalJson(payload))),
        cacheSettings: { store: true, maxAge: '600s' },
      }).result();
      return response.statusCode;
    },
    consensusIdenticalAggregation<number>(),
  )(url).result();
}

function multi(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, { values: [v] }]));
}

function parsed(f: Fetched): unknown {
  if (f.status < 200 || f.status >= 300) return null;
  try {
    return JSON.parse(f.body);
  } catch {
    return null;
  }
}

export function createPorts(runtime: Runtime<unknown>, config: PortsConfig): CheckPorts {
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error('CHAIN_NOT_SUPPORTED_BY_SDK');
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const apiToken = runtime.getSecret({ id: config.apiTokenSecretId }).result().value;
  const githubToken = runtime.getSecret({ id: config.githubTokenSecretId }).result().value;
  const karwan = { Accept: 'application/json', Authorization: `Bearer ${apiToken}` };
  const github = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'karwan-check',
  };

  const call = (to: Address, data: Hex): Hex =>
    bytesToHex(evm.callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    }).result().data);

  const blobAt = (runner: string, ref: string): string | null => {
    const url = `${GITHUB_API}/repos/${runner}/contents/${RUNNER_WORKFLOW}?ref=${encodeURIComponent(ref)}`;
    const v = nodeGet(runtime, url, github, (f) => {
      const j = parsed(f) as { sha?: unknown } | null;
      return typeof j?.sha === 'string' ? j.sha : null;
    });
    return typeof v === 'string' ? v : null;
  };

  return {
    now: () => Math.floor(runtime.now().getTime() / 1000),

    readTerms: (family, dealId) => {
      const t = decodeFunctionResult({
        abi: agreementAbi,
        functionName: 'getTerms',
        data: call(family, encodeFunctionData({ abi: agreementAbi, functionName: 'getTerms', args: [dealId] })),
      });
      return { verifier: t.verifier, checkPolicy: t.checkPolicy, partialBps: t.partialBps };
    },

    readDeal: (family, dealId) => {
      const d = decodeFunctionResult({
        abi: agreementAbi,
        functionName: 'getDeal',
        data: call(family, encodeFunctionData({ abi: agreementAbi, functionName: 'getDeal', args: [dealId] })),
      });
      return { state: d.state, revision: d.revision, checkPassed: d.checkPassed, checkFailed: d.checkFailed };
    },

    deliveredProof: (family, dealId, revision, blockHash) => {
      const reply = evm.filterLogs(runtime, {
        filterQuery: {
          blockHash: hexToBase64(blockHash),
          addresses: [hexToBase64(family)],
          topics: [{ topic: [hexToBase64(DELIVERED_TOPIC)] }, { topic: [hexToBase64(dealId)] }],
        },
      }).result();
      for (const log of reply.logs) {
        const decoded = decodeEventLog({
          abi: agreementAbi,
          eventName: 'Delivered',
          topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
          data: bytesToHex(log.data),
        });
        if (decoded.args.revision === revision) return decoded.args.proofHash;
      }
      return null;
    },

    fetchDoc: (hash) =>
      nodeGet(runtime, `${config.karwanApi}/api/cre/doc/${hash}`, karwan, (f) => {
        const j = parsed(f) as { body?: unknown } | null;
        return j?.body ?? null;
      }),

    runnerBlob: (runner) => blobAt(runner, config.runnerRef),

    dispatch: (args: DispatchArgs) => {
      const status = nodePost(runtime, `${GITHUB_API}/repos/${args.runner}/actions/workflows/replay.yml/dispatches`, github, {
        ref: config.runnerRef,
        inputs: {
          target_repo: args.targetRepo,
          sha: args.sha,
          deal_key: args.dealKey,
          policy_hash: args.policyHash,
          items_json: canonicalJson(args.items),
          setup: args.setup ?? '',
          timeout_minutes: String(args.timeoutMinutes),
          inputs_hash: args.inputsHash,
        },
      });
      return status === 204;
    },

    started: (info) => {
      nodePost(runtime, `${config.karwanApi}/api/cre/check/started`, karwan, info);
    },

    pending: (limit, cursor) => {
      const v = nodeGet(runtime, `${config.karwanApi}/api/cre/check/pending?limit=${limit}&cursor=${cursor}`, karwan, (f) => {
        const j = parsed(f) as { items?: unknown } | null;
        return Array.isArray(j?.items) ? j.items : [];
      });
      return Array.isArray(v) ? (v as PendingItem[]) : [];
    },

    closeItem: (dealKey, outcome) => {
      nodePost(runtime, `${config.karwanApi}/api/cre/check/close`, karwan, { dealKey, outcome });
    },

    pullHead: (repo, pull) => {
      const v = nodeGet(runtime, `${GITHUB_API}/repos/${repo}/pulls/${pull}`, github, (f) => {
        const j = parsed(f) as { head?: { sha?: string }; base?: { ref?: string } } | null;
        return j?.head?.sha && j.base?.ref ? { headSha: j.head.sha, baseRef: j.base.ref } : null;
      }) as { headSha: string; baseRef: string } | null;
      return v;
    },

    findRun: (runner, dealKey, sha, inputsHash) => {
      const title = `karwan ${dealKey} ${sha} ${inputsHash}`;
      const listUrl = `${GITHUB_API}/repos/${runner}/actions/workflows/replay.yml/runs?event=workflow_dispatch&per_page=30`;
      const found = nodeGet(runtime, listUrl, github, (f) => {
        const j = parsed(f) as { workflow_runs?: { id: number; display_title: string; status: string; created_at: string; head_sha: string }[] } | null;
        const runs = (j?.workflow_runs ?? []).filter((r) => r.display_title === title);
        if (runs.length === 0) return null;
        const completed = runs.filter((r) => r.status === 'completed').sort((a, b) => a.created_at.localeCompare(b.created_at));
        const pick = completed[0] ?? runs.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        return { id: pick.id, status: pick.status, createdAt: Math.floor(Date.parse(pick.created_at) / 1000), headSha: pick.head_sha };
      }) as { id: number; status: string; createdAt: number; headSha: string } | null;
      if (!found) return null;
      const status = found.status === 'completed' ? 'completed' : found.status === 'queued' ? 'queued' : 'in_progress';
      const jobs = (nodeGet(runtime, `${GITHUB_API}/repos/${runner}/actions/runs/${found.id}/jobs?per_page=20`, github, (f) => {
        const j = parsed(f) as { jobs?: { name: string; conclusion: string | null }[] } | null;
        return (j?.jobs ?? []).map((job) => ({ name: job.name, conclusion: job.conclusion }));
      }) ?? []) as RunFacts['jobs'];
      const runnerBlobSha = blobAt(runner, found.headSha) ?? '';
      return { runId: found.id, status, createdAt: found.createdAt, headSha: found.headSha, runnerBlobSha, inputsSha: sha, jobs };
    },

    writeReport: (report) => {
      const signed = runtime.report(prepareReportRequest(report)).result();
      const reply = evm.writeReport(runtime, {
        receiver: config.adapter as Address,
        report: signed,
        gasConfig: { gasLimit: config.gasLimit },
      }).result();
      return { ok: reply.txStatus === TxStatus.SUCCESS && reply.receiverContractExecutionStatus === RECEIVER_SUCCESS };
    },

    postEvidence: (payload) => {
      nodePost(runtime, `${config.karwanApi}/api/cre/check/evidence`, karwan, payload);
    },

    postDryRun: (payload) => {
      const signed = runtime.report(prepareReportRequest(bytesToHex(toBytes(canonicalJson(payload))))).result();
      const http = new cre.capabilities.HTTPClient();
      http.sendRequest(
        runtime,
        (sender: HTTPSendRequester, raw: string) =>
          sender.sendRequest({
            url: `${config.karwanApi}/api/cre/dry-run/result`,
            method: 'POST',
            multiHeaders: multi({ ...karwan, 'Content-Type': 'application/json' }),
            body: bytesToBase64(toBytes(raw)),
            cacheSettings: { store: true, maxAge: '600s' },
          }).result().statusCode,
        consensusIdenticalAggregation<number>(),
      )(canonicalJson({
        payload,
        report: {
          rawReport: bytesToHex(signed.rawReport()),
          context: bytesToHex(signed.reportContext()),
          signatures: signed.x_generatedCodeOnly_unwrap().sigs.map((s) => bytesToHex(s.signature)),
        },
      })).result();
    },
  };
}
