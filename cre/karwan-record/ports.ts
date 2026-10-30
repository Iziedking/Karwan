import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  text,
  TxStatus,
  type HTTPSendRequester,
  type Runtime,
} from '@chainlink/cre-sdk';
import { encodeFunctionData, hashMessage, parseAbi, zeroAddress, type Address, type Hex } from 'viem';
import { canonicalJson } from '../shared/canonical.js';
import { githubHeaders } from '../shared/github.js';
import type { RecordPorts } from './record.js';
import { recoverSigner } from './recover.js';

const GITHUB_API = 'https://api.github.com';
const ERC1271_MAGIC = '0x1626ba7e';
const erc1271 = parseAbi(['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)']);

/// ReceiverContractExecutionStatus.SUCCESS (not exported for EVM by the SDK).
/// The forwarder never reverts, so a write counts only when the receiver ran.
const RECEIVER_SUCCESS = 0;

export interface PortsConfig {
  chainSelectorName: string;
  adapter: string;
  githubTokenSecretId: string;
  sealKeySecretId: string;
  gasLimit: string;
}

function multi(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, { values: [v] }]));
}

export function createPorts(runtime: Runtime<unknown>, config: PortsConfig): RecordPorts {
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error('CHAIN_NOT_SUPPORTED_BY_SDK');
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const http = new cre.capabilities.HTTPClient();
  const token = runtime.getSecret({ id: config.githubTokenSecretId }).result().value;
  const github = githubHeaders(token);

  /// Each node fetches and keeps only the facts the rule needs; consensus
  /// compares those, not the raw bodies.
  const get = <T>(url: string, extract: (status: number, body: unknown) => T): T =>
    JSON.parse(
      http.sendRequest(
        runtime,
        (sender: HTTPSendRequester, u: string) => {
          const response = sender.sendRequest({ url: u, method: 'GET', multiHeaders: multi(github) }).result();
          let body: unknown = null;
          try {
            body = JSON.parse(text(response));
          } catch {
            body = null;
          }
          return canonicalJson(extract(response.statusCode, body) ?? null);
        },
        consensusIdenticalAggregation<string>(),
      )(url).result(),
    ) as T;

  return {
    now: () => Math.floor(runtime.now().getTime() / 1000),

    gist: (gistId) =>
      get(`${GITHUB_API}/gists/${gistId}`, (status, body) => {
        const j = body as { owner?: { login?: string }; files?: Record<string, { content?: string; truncated?: boolean }> } | null;
        if (status !== 200 || !j?.owner?.login || !j.files) return null;
        const first = Object.values(j.files)[0];
        if (!first?.content || first.truncated) return null;
        return { owner: j.owner.login, text: first.content };
      }),

    user: (login) =>
      get(`${GITHUB_API}/users/${login}`, (status, body) => {
        const j = body as { id?: number; created_at?: string } | null;
        if (status !== 200 || typeof j?.id !== 'number' || !j.created_at) return null;
        return { id: j.id, createdAt: Math.floor(Date.parse(j.created_at) / 1000) };
      }),

    mergedPrs: (login, sinceSec) => {
      const since = new Date(sinceSec * 1000).toISOString().slice(0, 10);
      const q = encodeURIComponent(`author:${login} is:pr is:merged merged:>=${since}`);
      return get(`${GITHUB_API}/search/issues?q=${q}&per_page=100`, (status, body) => {
        const j = body as { items?: { repository_url?: string; pull_request?: { merged_at?: string | null } }[] } | null;
        if (status !== 200 || !Array.isArray(j?.items)) return null;
        return j.items
          .filter((i) => i.repository_url && i.pull_request?.merged_at)
          .map((i) => ({
            repo: i.repository_url!.replace(`${GITHUB_API}/repos/`, ''),
            mergedAt: Math.floor(Date.parse(i.pull_request!.merged_at!) / 1000),
          }));
      });
    },

    stars: (repos) => {
      const out: Record<string, number> = {};
      for (const repo of repos) {
        const count = get(`${GITHUB_API}/repos/${repo}`, (status, body) => {
          const j = body as { stargazers_count?: number } | null;
          return status === 200 && typeof j?.stargazers_count === 'number' ? j.stargazers_count : null;
        });
        if (count === null) return null;
        out[repo] = count;
      }
      return out;
    },

    verifySignature: (wallet, message, signature) => {
      const signer = recoverSigner(message, signature);
      if (signer && signer.toLowerCase() === wallet.toLowerCase()) return true;
      try {
        const data = encodeFunctionData({ abi: erc1271, functionName: 'isValidSignature', args: [hashMessage(message), signature] });
        const reply = evm.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: wallet, data }), blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result();
        return bytesToHex(reply.data).slice(0, 10) === ERC1271_MAGIC;
      } catch {
        return false;
      }
    },

    sealKey: () => runtime.getSecret({ id: config.sealKeySecretId }).result().value as Hex,

    writeReport: (report) => {
      const signed = runtime.report(prepareReportRequest(report)).result();
      const reply = evm.writeReport(runtime, { receiver: config.adapter as Address, report: signed, gasConfig: { gasLimit: config.gasLimit } }).result();
      return { ok: reply.txStatus === TxStatus.SUCCESS && reply.receiverContractExecutionStatus === RECEIVER_SUCCESS };
    },
  };
}
