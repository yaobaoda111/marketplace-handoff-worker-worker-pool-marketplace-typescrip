import { z } from "zod";

export const marketplaceJobSchema = z.object({
  orderId: z.string().min(1),
  sellerId: z.string().min(1),
  buyerId: z.string().min(1),
  asset: z.object({
    downloadUrl: z.string().url(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    license: z.enum(["personal", "commercial"])
  }),
  buyerUpdate: z.object({
    status: z.literal("assets_submitted"),
    note: z.string().min(1).max(240)
  })
});

export type MarketplaceJob = z.infer<typeof marketplaceJobSchema>;

export type OrderHandoff = {
  orderId: string;
  buyerId: string;
  state: "ready_for_buyer";
  asset: MarketplaceJob["asset"];
  buyerMessage: string;
};

export function prepareOrderHandoff(job: MarketplaceJob): OrderHandoff {
  return {
    orderId: job.orderId,
    buyerId: job.buyerId,
    state: "ready_for_buyer",
    asset: job.asset,
    buyerMessage: job.buyerUpdate.note
  };
}
