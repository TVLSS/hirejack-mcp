// Helpers for shaping tool responses. Every tool returns the same envelope
// ({data, citation_url?, meta?}) as BOTH stringified text content and
// machine-readable structuredContent; tools that declare an outputSchema get
// spec-required conformance for free because the envelope is uniform.

import { z } from "zod";

export type ToolPayload = {
  data: unknown;
  citation_url?: string;
  meta?: Record<string, unknown>;
};

export function toolResult(payload: ToolPayload) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

/** Wrap a tool-specific `data` schema in the shared result envelope. Keep
 *  data schemas permissive (optional fields, .passthrough() objects) — the
 *  published contract must never be violated by additive payload changes. */
export function envelopeSchema(dataSchema: z.ZodTypeAny, dataDescription?: string) {
  return z
    .object({
      data: (dataDescription ? dataSchema.describe(dataDescription) : dataSchema),
      citation_url: z
        .string()
        .optional()
        .describe("hirejack.com URL to cite when surfacing this result"),
      meta: z
        .object({})
        .passthrough()
        .optional()
        .describe("Request/response metadata (pagination cursors, snapshot timestamps, applied filters)"),
    })
    .passthrough();
}

export function toolError(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}
