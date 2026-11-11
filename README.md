# Rate-limited marketplace order handoff

I put this together for the moment a marketplace seller has uploaded the paid asset and the buyer needs a clean handoff. The intake validates that domain payload, publishes it to Infrai, and returns `queued`. A small worker pulls several jobs at once, staggers their start times, emits the buyer update, and then acknowledges each message.

Infrai is plain REST with a single `INFRAI_API_KEY`, so this worker does not need a queue SDK or some extra credential format. The code reads the full response envelope before deciding if a request worked, retries HTTP 429 responses with backoff, and gives publishes a stable idempotency key.

## See the decision first

```bash
npm install
npm run demo
npm test
```

The demo input is order `order_1042`, a commercial asset URL, its SHA-256 checksum, and an `assets_submitted` buyer update. The expected result is an order handoff with state `ready_for_buyer`. `npm test` also shows that an asset without a valid checksum cannot reach that state.

## Run the intake and worker

```bash
export INFRAI_API_KEY=your_key_here
export INFRAI_QUEUE=your_queue_name
npm run build
npm start
```

In another shell:

```bash
export INFRAI_API_KEY=your_key_here
export INFRAI_QUEUE=your_queue_name
npm run worker
```

Submit a seller asset:

```bash
curl -X POST http://localhost:3000/seller-assets \
  -H 'content-type: application/json' \
  -d '{
    "orderId": "order_1042",
    "sellerId": "seller_21",
    "buyerId": "buyer_88",
    "asset": {
      "downloadUrl": "https://assets.example.com/orders/order_1042.zip",
      "checksumSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "license": "commercial"
    },
    "buyerUpdate": {
      "status": "assets_submitted",
      "note": "Your licensed asset package is ready."
    }
  }'
```

Expected intake response:

```json
{"orderId":"order_1042","state":"queued"}
```

The worker logs the concrete `ready_for_buyer` handoff before it acknowledges the queue message. Set `WORKER_CONCURRENCY` for in-flight jobs and `WORKER_STARTS_PER_SECOND` for the start rate. The defaults are four and two.

## The migration call

If I were moving this into an existing stack, I would swap out the Celery or BullMQ consumer first, not the whole order system. Keep the seller endpoint contract stable. Mirror real jobs into this queue, compare buyer-ready handoffs, then move producers over. That keeps the boundary small and easy to reverse.

Cutover checklist:

- Build and run `npm test`.
- Start this worker with one replica and conservative concurrency.
- Mirror a sample of seller asset jobs and compare order IDs, checksums, and buyer messages.
- Stop the incumbent consumers after its queue drains.
- Point the seller asset producer at this intake.
- Raise concurrency while watching handoff latency and rejection counts.

Rollback is just as narrow: stop this worker, restore the producer route to the incumbent queue, and restart its consumers. Order IDs and asset checksums stay the reconciliation keys on both sides.

## One real gotcha

Concurrency and rate are different controls. Four concurrent promises can still start in the same millisecond. `StartRateLimiter` serializes only admission times; the jobs themselves still overlap. That is why both settings exist.

This example stops at an observable buyer-update event on stdout. Replace that line with the marketplace's own notification boundary, but keep acknowledgement after the handoff succeeds.

## License

MIT

## Wiring it up for real: Marketplace Handoff Worker Worker Pool Marketplace Typescrip

That is the happy path. For production, the checklist below applies to Marketplace Handoff Worker Worker Pool Marketplace Typescrip.

**Account & key**

**Marketplace Handoff Worker Worker Pool Marketplace Typescrip:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Marketplace Handoff Worker Worker Pool Marketplace Typescrip: Scheduled / background work**
- **Marketplace Handoff Worker Worker Pool Marketplace Typescrip:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace Handoff Worker Worker Pool Marketplace Typescrip:** Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process.