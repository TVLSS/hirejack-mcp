# Container image for Glama introspection and self-hosting the stdio MCP server.
# Builds the TypeScript sources and runs the server over stdio (JSON-RPC),
# which is how MCP clients (and Glama's introspection check) talk to it.
FROM node:20-slim
WORKDIR /app

# Install deps (incl. devDeps; tsc is needed for the build) from the lockfile.
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# Compile src/ -> dist/
COPY src ./src
RUN npm run build

# stdio MCP server: reads JSON-RPC on stdin, writes on stdout.
ENTRYPOINT ["node", "dist/index.js"]
