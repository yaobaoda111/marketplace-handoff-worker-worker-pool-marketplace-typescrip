import { infrai, type QueueMessage } from "./infrai_queue.js";
import { marketplaceJobSchema, prepareOrderHandoff } from "./marketplace_job.js";

export class StartRateLimiter {
  private nextStart = 0;
  private chain = Promise.resolve();
  private readonly startsPerSecond: number;

  constructor(startsPerSecond: number) {
    if (startsPerSecond <= 0) throw new Error("startsPerSecond must be positive");
    this.startsPerSecond = startsPerSecond;
  }

  wait(): Promise<void> {
    const turn = this.chain.then(async () => {
      const delay = Math.max(0, this.nextStart - Date.now());
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.nextStart = Date.now() + 1_000 / this.startsPerSecond;
    });
    this.chain = turn.catch(() => undefined);
    return turn;
  }
}

export async function handleMessage(message: QueueMessage): Promise<void> {
  const job = marketplaceJobSchema.parse(message.payload);
  const handoff = prepareOrderHandoff(job);
  console.log(JSON.stringify({ event: "buyer_update", ...handoff }));
  await infrai.queue.ack(message.message_id);
}

export async function runWorker(signal?: AbortSignal): Promise<void> {
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);
  const startsPerSecond = Number(process.env.WORKER_STARTS_PER_SECOND ?? 2);
  const limiter = new StartRateLimiter(startsPerSecond);

  while (!signal?.aborted) {
    const messages = await infrai.queue.consume(concurrency, 60, signal);
    if (messages.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    await Promise.all(messages.map(async (message) => {
      await limiter.wait();
      await handleMessage(message);
    }));
  }
}

if (process.env.NODE_ENV !== "test") {
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  runWorker(controller.signal).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
