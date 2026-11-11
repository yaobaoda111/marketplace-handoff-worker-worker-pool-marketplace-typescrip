import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_queue.js";
import { marketplaceJobSchema } from "./marketplace_job.js";

const port = Number(process.env.PORT ?? 3000);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export function statusForError(error: unknown): number {
  if (error instanceof ZodError || error instanceof SyntaxError) return 400;
  if (error instanceof InfraiError && error.status >= 400 && error.status < 500) return error.status;
  return 500;
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/seller-assets") {
    reply(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const job = marketplaceJobSchema.parse(await readJson(request));
    const idempotencyKey = createHash("sha256")
      .update(`${job.orderId}:${job.asset.checksumSha256}`)
      .digest("hex");
    await infrai.queue.publish(job, idempotencyKey);
    reply(response, 202, { orderId: job.orderId, state: "queued" });
  } catch (error) {
    reply(response, statusForError(error), {
      error: error instanceof Error ? error.message : "Request rejected"
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => console.log(`Seller asset intake listening on :${port}`));
}
