import {
  bytesToBase64,
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  LATEST_BLOCK_NUMBER,
  prepareReportRequest,
  text,
  TxStatus,
  type HTTPSendRequester,
  type Runtime,
} from '@chainlink/cre-sdk';
import { concatHex, decodeFunctionResult, encodeFunctionData, toBytes, zeroAddress, type Address, type Hex } from 'viem';
import { canonicalJson } from '../shared/canonical.js';
import { agreementAbi } from '../shared/suiteAbi.js';
import type { OpenDeal, RiskPorts } from './risk.js';

/// ReceiverContractExecutionStatus.SUCCESS (not exported for EVM by the SDK).
/// The forwarder never reverts, so a write counts only when the receiver ran.
const RECEIVER_SUCCESS = 0;

export interface PortsConfig {
  chainSelectorName: string;
  karwanApi: string;
  apiTokenSecretId: string;
  adapter: string;
  gasLimit: string;
}

function multi(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, { values: [v] }]));
}

export function createPorts(runtime: Runtime<unknown>, config: PortsConfig): RiskPorts {
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error('CHAIN_NOT_SUPPORTED_BY_SDK');
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const http = new cre.capabilities.HTTPClient();
  const apiToken = runtime.getSecret({ id: config.apiTokenSecretId }).result().value;
  const karwan = { Accept: 'application/json', Authorization: `Bearer ${apiToken}` };
  const adapter = config.adapter as Address;

  const view = (to: Address, data: Hex): Hex =>
    bytesToHex(evm.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to, data }), blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result().data);

  return {
    now: () => Math.floor(runtime.now().getTime() / 1000),

    openDeals: (limit, cursor) => {
      const agreed = http.sendRequest(
        runtime,
        (sender: HTTPSendRequester, url: string) => {
          const response = sender.sendRequest({ url, method: 'GET', multiHeaders: multi(karwan) }).result();
          if (response.statusCode !== 200) return '[]';
          try {
            const body = JSON.parse(text(response)) as { items?: unknown };
            return canonicalJson(Array.isArray(body.items) ? body.items : []);
          } catch {
            return '[]';
          }
        },
        consensusIdenticalAggregation<string>(),
      )(`${config.karwanApi}/api/cre/risk/open-deals?limit=${limit}&cursor=${cursor}`).result();
      return JSON.parse(agreed) as OpenDeal[];
    },

    agreementDeal: (family, dealId) => {
      const d = decodeFunctionResult({
        abi: agreementAbi,
        functionName: 'getDeal',
        data: view(family, encodeFunctionData({ abi: agreementAbi, functionName: 'getDeal', args: [dealId] })),
      });
      return {
        state: d.state,
        deliveredAt: Number(d.deliveredAt),
        deadline: Number(d.deadline),
        reviewEnd: Number(d.reviewEnd),
        checkFailed: d.checkFailed,
        partsPaid: d.partsPaid,
      };
    },

    disputeOf: (family, dealId) => {
      const x = decodeFunctionResult({
        abi: agreementAbi,
        functionName: 'disputeOf',
        data: view(family, encodeFunctionData({ abi: agreementAbi, functionName: 'disputeOf', args: [dealId] })),
      });
      return {
        openedAt: Number(x.openedAt),
        proposed: x.proposed,
        escalated: x.escalated,
        proposedAt: Number(x.proposedAt),
        escalatedAt: Number(x.escalatedAt),
      };
    },

    simulate: (call) => {
      try {
        evm.callContract(runtime, {
          call: encodeCallMsg({ from: adapter, to: call.family, data: concatHex([call.selector, call.args]) }),
          blockNumber: LATEST_BLOCK_NUMBER,
        }).result();
        return true;
      } catch {
        return false;
      }
    },

    writeReport: (report) => {
      const signed = runtime.report(prepareReportRequest(report)).result();
      const reply = evm.writeReport(runtime, { receiver: adapter, report: signed, gasConfig: { gasLimit: config.gasLimit } }).result();
      return { ok: reply.txStatus === TxStatus.SUCCESS && reply.receiverContractExecutionStatus === RECEIVER_SUCCESS };
    },

    postAlerts: (alerts) => {
      const signed = runtime.report(prepareReportRequest(bytesToHex(toBytes(canonicalJson({ alerts }))))).result();
      const payload = canonicalJson({
        alerts,
        report: {
          rawReport: bytesToHex(signed.rawReport()),
          context: bytesToHex(signed.reportContext()),
          signatures: signed.x_generatedCodeOnly_unwrap().sigs.map((s) => bytesToHex(s.signature)),
        },
      });
      http.sendRequest(
        runtime,
        (sender: HTTPSendRequester, raw: string) =>
          sender.sendRequest({
            url: `${config.karwanApi}/api/cre/risk/alerts`,
            method: 'POST',
            multiHeaders: multi({ ...karwan, 'Content-Type': 'application/json' }),
            body: bytesToBase64(toBytes(raw)),
            cacheSettings: { store: true, maxAge: '600s' },
          }).result().statusCode,
        consensusIdenticalAggregation<number>(),
      )(payload).result();
    },
  };
}
