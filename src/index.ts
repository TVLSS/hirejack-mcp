#!/usr/bin/env node
// stdio transport entry. Reuses the same registry as the Lambda transport.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  callTool,
  listTools,
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
} from "./registry.js";
import { listPrompts, getPrompt } from "./prompts.js";
import { listResources, readResource } from "./resources.js";

const server = new Server(SERVER_INFO, {
  capabilities: {
    tools: { listChanged: false },
    prompts: { listChanged: false },
    // No subscribe: the vocabulary changes on taxonomy releases, not live, so
    // there is nothing for a client to usefully subscribe to.
    resources: { listChanged: false, subscribe: false },
  },
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

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: listPrompts(),
}));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  return getPrompt(req.params.name, (req.params.arguments as Record<string, string>) || {});
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: listResources(),
}));

// Every resource is a fixed URI — no templates. Answered explicitly (rather
// than left to fall through as method-not-found) because clients probe this
// during discovery and an error there reads as a broken server.
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  return readResource(req.params.uri);
});

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write("hirejack-mcp ready (stdio)\n");
