import { marketplaceJobSchema, prepareOrderHandoff } from "./marketplace_job.js";

const job = marketplaceJobSchema.parse({
  orderId: "order_1042",
  sellerId: "seller_21",
  buyerId: "buyer_88",
  asset: {
    downloadUrl: "https://assets.example.com/orders/order_1042.zip",
    checksumSha256: "a".repeat(64),
    license: "commercial"
  },
  buyerUpdate: {
    status: "assets_submitted",
    note: "Your licensed asset package is ready."
  }
});

console.log(prepareOrderHandoff(job));
