#!/usr/bin/env node
// stdio transport entry. Reuses the same registry as the Lambda transport.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  callTool,
  listTools,
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
} from "./registry.js";

const server = new Server(SERVER_INFO, {
  capabilities: { tools: { listChanged: false } },
  instructions: SERVER_INSTRUCTIONS,
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
}));

// stdio is unauthenticated — Pro+ tools surface a clear "auth required"
// error since `userId` is absent from the context.
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  return callTool(req.params.name, req.params.arguments, { source: "stdio" });
});

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write("hirejack-mcp ready (stdio)\n");
