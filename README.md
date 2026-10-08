# Rebuttal

**An AI agent that defends small online sellers in PayPal disputes.**

A buyer says the package never came. The seller has days to respond. Most small sellers either refund out of fear or send a rushed reply that leaves out the evidence that would have won. Rebuttal investigates each dispute the moment it arrives. It reads the PayPal dispute, the order, the shipment tracker and the buyer's history, plus the shop's own records. Then it recommends one of three moves:

- **Fight**, with an evidence statement written for the PayPal specialist and each fact traced to its source.
- **Partial refund**, with a specific amount, when the seller is partly at fault.
- **Refund**, when the case can't be won and fighting would waste the seller's time.

The seller reviews the recommendation, edits it if they want, and approves it. Only then does Rebuttal call PayPal.

Built for the [Build What's Next with PayPal and AI](https://paypalaihackathon.devpost.com/) hackathon.

**Live demo:** https://rebuttal.onrender.com _(placeholder until deployed; the free instance sleeps, so the first load can take about a minute)_

## Try it (no PayPal login needed)

The demo opens on the **Simulator**. Open a dispute, click **Investigate** to watch the agent work, approve its recommendation, then pick **PayPal rules for seller** (or for buyer) to simulate the ruling. **File a test dispute** adds a new case, and **Reset demo** starts over. In the inbox, search or filter by claim, stage and amount; the pinned totals row tracks money at risk and kept for whatever is shown, and **Export outcomes (CSV)** downloads the ledger. The toggle at the top switches to **Live PayPal sandbox**, which shows real disputes filed by sandbox buyers.

### Simulator vs live sandbox

| Step | Simulator | Live PayPal sandbox |
|---|---|---|
| AI investigation | Real Gemini runs, replayed from `cache/investigations/` so the free tier's rate limit never stalls a demo. **Re-run** calls the model live. | Live Gemini run against the real dispute through the PayPal Agent Toolkit. |
| Fight: evidence + tracking | Works | Works (verified: evidence accepted, tracking added). |
| PayPal's ruling (sandbox `adjudicate`) | Works | Works (verified: a $184 "not received" claim ruled for the seller, hold released). |
| Partial-refund offer | Works | Not possible in our tests: the sandbox opened every buyer dispute as a chargeback, and PayPal allows no offers on chargebacks. The app says so instead of failing silently. |
| Full refund | Works | Works when the seller account has a balance; our India-based sandbox seller had no USD balance, so PayPal returned `INSUFFICIENT_FUNDS`, which the app reports. |

Why both: buyer disputes can only be filed by hand in the sandbox and take minutes to hours to appear, so a judge can't create one on the spot. The simulator returns the same JSON shapes as the sandbox, so the same code paths, UI and agent run in both.

## How it uses PayPal

| PayPal capability | Used for |
|---|---|
| [PayPal Agent Toolkit](https://github.com/paypal/agent-toolkit) (`@paypal/agent-toolkit`) | The agent's read tools: `get_dispute`, `get_order`, `get_shipment_tracking`, `list_transactions`. The toolkit's own schemas and descriptions are passed to the model unchanged. |
| Agent Toolkit: `list_disputes`, `get_dispute` | The dispute inbox. |
| Agent Toolkit: `create_shipment_tracking` | Before fighting, adds the carrier tracking to the PayPal transaction if the seller never uploaded it. |
| Agent Toolkit: `accept_dispute_claim` | Refunds when the seller agrees the case isn't worth fighting. |
| Disputes API: `provide-evidence` | Sends the approved statement with the response attached as a PDF. The live sandbox accepted one evidence per call, so the strongest type goes first. |
| Disputes API: `provide-supporting-info` | Sends the statement while a chargeback is under PayPal review. |
| Orders API: `/v2/checkout/orders/{id}/track` | Adds carrier tracking when the app lacks the older trackers permission. |
| Disputes API: `make-offer` | Sends an approved partial refund. |
| Disputes API (sandbox): `adjudicate` | Simulates PayPal's ruling, so the full lifecycle runs end-to-end in a demo. |
| Webhooks: `CUSTOMER.DISPUTE.*` + `verify-webhook-signature` | New disputes are pulled in and analyzed automatically. |

## How it uses AI

Google Gemini (`gemini-3.5-flash-lite` on the free tier by default, falling back to `gemini-3.5-flash` if it is overloaded; set `GEMINI_MODEL` / `GEMINI_FALLBACK_MODELS` to change them) runs a function-calling loop in [`src/lib/agent.ts`](src/lib/agent.ts). Claude works too: set `AI_PROVIDER=claude` and `APP_ANTHROPIC_API_KEY`. Both sit behind one small adapter interface in [`src/lib/model`](src/lib/model).

1. It investigates with the read-only PayPal tools and a `get_store_records` tool for the shop's listing text, customer messages and carrier scans.
2. It cross-checks the evidence. For example, it compares the carrier's delivery address with the shipping address on the order, and checks a payer's earlier purchases before an "unauthorized" claim.
3. It submits a structured recommendation through a strict-schema tool. The server validates it, and an invalid one goes back to the model as an error.

The model never moves money. Every write call to PayPal happens on the server after a person clicks Approve.

Finished investigations are saved (`cache/investigations/`) and replayed step by step for the same dispute facts, so the hosted demo keeps working when the free tier's per-minute limit is hit. **Re-run** forces a fresh investigation, and falls back to the saved one if the model is rate-limited.

## Run it locally

Requires Node 22+.

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

With no PayPal credentials, the app runs against a built-in **PayPal simulator** ([`src/lib/paypal/mock.ts`](src/lib/paypal/mock.ts)). It returns the same JSON shapes as the sandbox and comes with four realistic disputes for a demo pottery-and-leather shop. Click **File a test dispute** to watch the agent work on a new case.

To use the real PayPal sandbox, set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a sandbox app at developer.paypal.com (Apps & Credentials, Sandbox). `npm run check:live` confirms the Gemini key and the sandbox credentials work, without printing either.

### Seeding the sandbox

Disputes are filed by buyers. To create one in the sandbox:

1. `npm run seed:sandbox create JK-1042` creates a real sandbox order that matches the demo shop's records and prints a checkout link.
2. Open the link and pay as a sandbox **personal** account. Use a US personal account: an India buyer can't pay an India seller.
3. `npm run seed:sandbox capture --wait` captures the payment and adds the carrier tracking.
4. As the same buyer, open Activity at sandbox.paypal.com, pick the payment and report a problem. The dispute appears in Rebuttal once PayPal's API lists it (in our tests, from a few minutes up to a few hours).

Disputes over $11 escalate on day 11 in the sandbox; see PayPal's [dispute testing guide](https://developer.paypal.com/disputes/test-go-live).

### Webhooks

In the sandbox app, add a webhook to `https://<your-host>/api/webhooks/paypal` for the `Customer dispute created / updated / resolved` events. Set `PAYPAL_WEBHOOK_ID` to its ID. New disputes are then analyzed in the background, so a recommendation is ready when the seller opens the case.

## Deploy

`render.yaml` is a Render Blueprint for a free web service: `npm ci && npm run build`, `npm start` (binds to `$PORT`), health check `/api/health`, starting on the simulator (`PAYPAL_MODE=mock`). In Render choose **New > Blueprint**, pick this repository and paste `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` when asked. Without the PayPal keys the app runs on the simulator only.

## Tests

```bash
npm test
```

The agent-loop tests drive the real loop and the PayPal simulator with a scripted model. They cover parallel tool results, retries after invalid recommendations, and tool errors returned to the model.

## Project layout

```
src/lib/agent.ts            Agent tool-use loop and recommendation schema
src/lib/model/              Gemini (default) and Claude adapters
src/lib/investigation-cache.ts  Saved investigations for rate-limit-proof demos
src/lib/paypal/sandbox.ts   PayPal sandbox gateway (Agent Toolkit + Disputes REST)
src/lib/paypal/mock.ts      In-memory PayPal simulator for demos and tests
src/lib/actions.ts          Executes the approved decision; maps PayPal outcomes
src/lib/demo/scenarios.ts   Demo shop data: listings, messages, carrier scans
src/components/Inbox.tsx    Dispute inbox (AG Grid: search, column filters, live totals row, CSV export)
src/components/EvidenceGrid.tsx  Evidence trail: each fact, its PayPal evidence type and source tool (AG Grid)
src/components/CaseView.tsx Live investigation, recommendation, approval
```

## License

MIT
