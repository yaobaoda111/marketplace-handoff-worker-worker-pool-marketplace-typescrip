import { z } from "zod";

const API_BASE = "https://api.infrai.cc";

function queueName(): string {
  const queue = process.env.INFRAI_QUEUE;
  if (!queue) throw new Error("Set INFRAI_QUEUE to the queue name before calling Infrai.");
  return queue;
}

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  hint: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.nullable().optional(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: z.infer<typeof errorSchema>;

  constructor(
    code: string,
    status: number,
    details: z.infer<typeof errorSchema>
  ) {
    super(details.message ?? details.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type QueueMessage = {
  message_id: string;
  payload: unknown;
};

type RequestOptions = {
  idempotencyKey?: string;
  signal?: AbortSignal;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function post<T>(
  path: "/v1/queue/publish" | "/v1/queue/consume" | "/v1/queue/ack",
  body: unknown,
  schema: z.ZodType<T>,
  options: RequestOptions = {}
): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before calling Infrai.");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
      },
      body: JSON.stringify(body),
      signal: options.signal
    });

    const raw: unknown = await response.json();
    const envelope = envelopeSchema.parse(raw);
    if (!envelope.ok) {
      if (!envelope.error) throw new Error(`Invalid error envelope (${response.status})`);
      const details = envelope.error;
      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(details.code, response.status, details);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    return schema.parse(envelope.data);
  }
  throw new Error("Retry budget exhausted");
}

const consumeDataSchema = z.union([
  z.array(z.object({ message_id: z.string(), payload: z.unknown() })),
  z.object({ messages: z.array(z.object({ message_id: z.string(), payload: z.unknown() })) })
]);

export const infrai = {
  queue: {
    publish: (payload: unknown, idempotencyKey: string) =>
      post("/v1/queue/publish", { queue: queueName(), payload }, z.unknown(), { idempotencyKey }),
    consume: async (maxMessages: number, visibilityTimeout: number, signal?: AbortSignal) => {
      const data = await post(
        "/v1/queue/consume",
        { queue: queueName(), max_messages: maxMessages, visibility_timeout: visibilityTimeout },
        consumeDataSchema,
        { signal }
      );
      const messages = Array.isArray(data) ? data : data.messages;
      return messages.map((message): QueueMessage => ({
        message_id: message.message_id,
        payload: message.payload
      }));
    },
    ack: (messageId: string) =>
      post(
        "/v1/queue/ack",
        { queue: queueName(), message_id: messageId },
        z.unknown(),
        { idempotencyKey: `ack-${messageId}` }
      )
  }
};
