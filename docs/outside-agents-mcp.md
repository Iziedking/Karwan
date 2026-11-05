# Connect an outside agent to Karwan

This guide is for people who build agents. An agent that runs outside Karwan, such as Claude, ChatGPT or a company's own bot, can work for one person through the Karwan MCP server. It can find Karwan sellers who fit a need, check a member's public record, open and fund a protected deal from its own wallet, and follow the deal to the end. It can never pay the seller by itself: only its person can say the work is done.

The design behind this is [view 15, outside agents](architecture/15-outside-agents.md). Everything here runs on Arc Testnet.

## Before you start

You need three things:

1. **An agent wallet registered in World AgentBook.** Karwan checks that one real person stands behind each agent by looking the wallet up in World's AgentBook on World Chain. Register the wallet once with World's CLI and check that it worked:

   ```bash
   npx @worldcoin/agentkit-cli register <agent-wallet-address>
   ```

   ```bash
   npx @worldcoin/agentkit-cli status <agent-wallet-address>
   ```

   The register step asks the person to verify in World App. World's [AgentKit integration guide](https://docs.world.org/agents/agent-kit/integrate) has the details.
2. **USDC in a Circle Gateway balance on Arc Testnet**, for the two paid tools. A few cents pays for many calls.
3. **USDC and a little gas in the agent wallet on Arc Testnet**, for the deals it funds. Arc pays gas in USDC.

## The endpoint

```
https://api.karwan.site/mcp
```

MCP over Streamable HTTP, with no sessions. Every message is a POST, answered with JSON. Send `Accept: application/json, text/event-stream` and `Content-Type: application/json`.

## Prove a person stands behind the agent

Every request carries a World AgentKit proof in the `agentkit` header.

1. POST to `/mcp` without the header. Karwan answers `401` with a challenge under `extensions.agentkit`.
2. Sign it with World's AgentKit client and the agent wallet:

   ```ts
   import { createAgentkitClient } from '@worldcoin/agentkit';

   const client = createAgentkitClient({
     signer: {
       address: account.address,
       chainId: 'eip155:5042002',
       type: 'eip191',
       signMessage: (message) => account.signMessage({ message }),
     },
   });
   const header = await client.createHeader(challenge.extensions.agentkit);
   ```

3. Send that value as the `agentkit` header on every request. It is good until the challenge expires, about 5 minutes. After that, ask for a new challenge the same way.

| Answer | Meaning |
|---|---|
| `401` | No proof was sent. The body holds the challenge to sign. |
| `403` | The proof is wrong or expired, or the wallet is not in AgentBook. |
| `503` | World's AgentBook could not be reached. Try again shortly. |

## The tools

| Tool | What it does | Price |
|---|---|---|
| `find_counterparty` | Up to 5 Karwan sellers who fit a need: tag, tier, reasons, rating, price and days | 0.10 USDC |
| `check_person` | A member's public record: name, tag, tier, fixed reasons and rating | 0.005 USDC |
| `open_protected_deal` | Opens a deal with a seller and returns the quote and the first call to send | free |
| `fund_deal` | Checks the create call on Arc and returns the budget, approve and fund calls | free |
| `deal_status` | Where the deal stands, read from Arc, and what to do next | free |
| `request_release` | A one-time link for the person to say whether they are happy | free |
| `open_dispute` | The same one-time link, for when the person is not happy | free |

Karwan matches on full records inside Karwan. An outside agent never receives a score, deal counts or amounts.

## Paying for a tool

`find_counterparty` and `check_person` are paid with x402 through Circle Gateway on Arc Testnet.

1. Call the tool. The first answer is an error result that carries the payment it needs.
2. Sign that payment from the Gateway balance and call the tool again with it in `_meta["x402/payment"]`. The `@x402/mcp` client does both steps for you when you give it Circle's Gateway scheme from `@circle-fin/x402-batching`.
3. Karwan settles the payment only after the tool answers without an error. A call Karwan refuses is never charged.

## A deal from start to end

The deal tools never sign anything. Each one returns the exact call for the agent's wallet to send, and Karwan reads it back from Arc.

1. **Find a seller.** `find_counterparty` with the need in plain words, a budget of up to 1,000 USDC and a deadline of 1 to 60 days. If no one fits, it says so and suggests other words, a larger budget or more days.
2. **Open the deal.** `open_protected_deal` with the seller's tag, the work, the price and the deadline.
   - The first time, the person behind the agent has to verify once with World ID. The agent gets a link to send them and nothing is opened. They need no Karwan account. Call `open_protected_deal` again once they are done.
   - Once they have verified, the answer is the quote and the create call. The quote is the price of the work plus half of Karwan's 1 percent fee: 110 USDC of work costs 110.55 USDC. Tell the person this amount before you fund anything.
3. **Fund it.** Send the create call from the agent wallet, then call `fund_deal` with the deal ref and the transaction hash. Karwan checks the call on Arc and returns the budget, approve and fund calls, or how much more USDC the wallet needs. Send all three in order.
4. **Wait for delivery.** The seller sees the deal as funded by an agent for a verified person and marks it delivered. Check `deal_status` now and then.
5. **Ask the person.** Once the work is delivered, call `request_release` and send the person the one-time link. They answer with the World ID they verified with:
   - **Happy:** the seller is paid.
   - **Not happy:** they write one line about what is wrong. The seller then has 3 days to dispute, or the money goes back to the agent wallet.
6. **If the person says nothing**, the seller is paid when the 5-day review ends, as on every Karwan deal. When `deal_status` says `remindYourPerson`, the review ends within a day, so remind them.
7. **If the seller misses the deadline** without delivering, `deal_status` returns the refund call. Send it to get the money back.

## When Karwan refuses

A refusal comes back as an error result with a `code` and a plain `message`. The common ones:

| Code | What to do |
|---|---|
| `NOT_PAIRED` | The person has not verified with World ID yet. Send them the link from the answer. |
| `NO_SELLER` | No seller has that tag. |
| `SELLER_OFF` | The seller has turned off deals from outside agents. Choose another seller. |
| `SELF` | The agent wallet is the seller's own. An agent cannot open a deal with itself. |
| `OVER_CAP` | The deal is above what one deal can hold right now. The message says the most. |
| `CLOSED` | Deals on the job escrow are paused. Try again later. |
| `BAD_AMOUNT`, `BAD_DEADLINE`, `BAD_WORK` | Fix that field and call again. |
| `PENDING` | The transaction is not on Arc yet. Try again in a few seconds. |
| `BAD_RECEIPT` | The transaction did not create this deal with the quoted terms. Send the create call exactly as returned. |
| `NOT_YOURS` | This agent did not open a deal with that ref. |
| `WRONG_STATE` | The step does not fit where the deal stands. Call `deal_status` to see what comes next. |
| `BUSY` | The deal is being updated. Try again in a moment. |
| `PAYMENTS_OFF` | Paid tools are not available right now. Try again later. |

## What is not available yet

- Posting a request for sellers to bid on. The person behind an outside agent has only their World ID, and posting needs a Karwan account.
- Mainnet. Circle's Gateway nanopayments run on Arc Testnet only for now.
