# ch4p gateway — multi-stage Docker build
# Stage 1: build
FROM node:22-alpine AS builder

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json apps/cli/
COPY packages/agent/package.json packages/agent/
COPY packages/canvas/package.json packages/canvas/
COPY packages/channels/package.json packages/channels/
COPY packages/core/package.json packages/core/
COPY packages/engines/package.json packages/engines/
COPY packages/gateway/package.json packages/gateway/
COPY packages/memory/package.json packages/memory/
COPY packages/observability/package.json packages/observability/
COPY packages/plugin-x402/package.json packages/plugin-x402/
COPY packages/providers/package.json packages/providers/
COPY packages/security/package.json packages/security/
COPY packages/skills/package.json packages/skills/
COPY packages/supervisor/package.json packages/supervisor/
COPY packages/tools/package.json packages/tools/
COPY packages/tunnels/package.json packages/tunnels/
COPY packages/voice/package.json packages/voice/

RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build all packages
RUN pnpm -r build

# -----------------------------------------------------------------------
# Stage 2: runtime
# -----------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN corepack enable

# Install native build tools needed by better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy only the built artefacts + node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Default data directory — mount a volume here in production
ENV CH4P_DATA_DIR=/data
VOLUME ["/data"]

# Gateway port
EXPOSE 3141

# Default command: start the gateway
# Override by passing your own args, e.g.:
#   docker run ch4p ch4p gateway --port 8080
ENTRYPOINT ["node", "apps/cli/dist/index.js"]
CMD ["gateway"]
