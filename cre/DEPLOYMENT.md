# CRE production deployment: 13 September 2026

## Confirmed setup

- Network: Arc Testnet, chain ID `5042002`.
- Receiver: `0xb63d5Ef3dC0b2a8297fCE1261C9481C6D6647F93`.
- Receiver deployment transaction: `0xc6a80d3b6eb75be496012bb953a89bde5af14811ca6bcb26e170e21583de217b`.
- Binding transaction: `0x32df63cd6a5805cca451df358492da4837dac8aec0c7e96a23b63218e36693f6`.
- Workflow: `karwan-git-prod`, private registry, DON family `zone-a`.
- Workflow ID: `00ab26d9e16783c1371c0c2c0a14c968200c738848e17f5d039ffaf1d16d34c6`.
- Workflow owner: `0x6aE4fE38dFbBc609D720b2f0814d72E1a94Cc104`.
- Registered at `2026-09-13T02:57:25Z`; CRE reports `ACTIVE`.
- Raw frozen WASM SHA-256: `7ac30fbfd0ccd7c2685709555bc85c2ae0cfd1805213dc0028ca63e9b9f51a90`.
- CLI binary hash: `c088abc71ddc6dee1ab142423f94634ee470bacf51f1b8648411843ada68a7ef`.
- Final config hash: `f2cafe2a460d2b426c94234494ad76ff64494af4b098d6f469ac8448c2933bcd`.

The CLI loaded the frozen binary during deployment; it did not recompile it.
The uploaded workflow ID was checked against the receiver's on-chain binding.
Production now uses the new receiver, with automatic publication and receipt
reconciliation enabled. The API container is healthy and `/health` returned 200.
The production `.env` was backed up with restricted permissions before changing
the receiver. No credentials belong in this record.

## Outstanding hosted execution failure

Registration succeeded, but confidential execution has not succeeded. Two
observed runs failed:

| Execution ID | Started (UTC) | Result |
| --- | --- | --- |
| `8a4e1b00-6d47-401c-aed0-fd8a019721bb` | `2026-09-13T02:58:01Z` | Failure |
| `c2863a36-cf74-4e5d-8e08-c381bfa484ea` | `2026-09-13T03:00:01Z` | Failure |

The returned capability error includes:

```text
failed to get enclave params
enclave config validation failed
cannot validate enclave config: DON members not set
```

The execution also reports `DELIVERY_REQUEST_UNAVAILABLE`. The enclave error
points to confidential-runtime configuration; Chainlink support must confirm the
cause and remedy. Do not replace this workflow with a non-confidential path or
change its bound binary merely to produce a passing demo.

The checked deal has a pending request with no lease or bound receipt. A direct
read of the replacement registry returned `recordedAt = 0`. It has not passed
verification, and its evidence release gate remains blocked. The public Arc RPC
also returned a rate-limit error from the VM during diagnosis; a separate local
read succeeded. That failed diagnostic read is not evidence of an on-chain
receipt or a reconciler failure.

## Message for Chainlink support

Karwan's confidential workflow is registered and Active in the private registry
on DON family `zone-a`, but hosted execution repeatedly fails while obtaining
enclave parameters: `cannot validate enclave config: DON members not set`.

Workflow ID:
`00ab26d9e16783c1371c0c2c0a14c968200c738848e17f5d039ffaf1d16d34c6`.
Example failed execution:
`c2863a36-cf74-4e5d-8e08-c381bfa484ea` at `2026-09-13T03:00:01Z`.

The workflow uses `handlerInTee` with AWS Nitro in `us-west-2`. Its Arc Testnet
receiver is deployed and bound to this exact workflow ID. Could you check the
confidential capability's DON membership/enclave configuration for this
deployment? Please confirm whether any organization configuration is missing.

## Resume verification

After the runtime issue is resolved, inspect the current request's expiry before
testing. The request lifetime is one hour. If it has expired, use a supported
delivery correction to publish a new revision; never mark it passed manually.
Check the hosted execution, Arc receipt transaction, backend queue binding, and
UI result before demonstrating settlement. The hosted registration and receiver
deployment alone do not prove an end-to-end verification.
