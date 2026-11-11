import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceJobSchema, prepareOrderHandoff } from "../src/marketplace_job.js";

test("a validated seller asset becomes a buyer-ready handoff", () => {
  const job = marketplaceJobSchema.parse({
    orderId: "order_1042",
    sellerId: "seller_21",
    buyerId: "buyer_88",
    asset: {
      downloadUrl: "https://assets.example.com/orders/order_1042.zip",
      checksumSha256: "b".repeat(64),
      license: "commercial"
    },
    buyerUpdate: {
      status: "assets_submitted",
      note: "Your licensed asset package is ready."
    }
  });

  assert.deepEqual(prepareOrderHandoff(job), {
    orderId: "order_1042",
    buyerId: "buyer_88",
    state: "ready_for_buyer",
    asset: job.asset,
    buyerMessage: "Your licensed asset package is ready."
  });
});

test("an asset without a sha256 checksum never reaches handoff", () => {
  const result = marketplaceJobSchema.safeParse({
    orderId: "order_1042",
    sellerId: "seller_21",
    buyerId: "buyer_88",
    asset: {
      downloadUrl: "https://assets.example.com/orders/order_1042.zip",
      checksumSha256: "missing",
      license: "commercial"
    },
    buyerUpdate: {
      status: "assets_submitted",
      note: "Your licensed asset package is ready."
    }
  });

  assert.equal(result.success, false);
});
