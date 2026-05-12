// Helpers for shaping tool responses. MCP tools return text content, so we
// JSON-stringify structured payloads with a citation_url for Claude to surface.

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
  };
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
