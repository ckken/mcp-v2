FROM oven/bun:1.3.14 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/mcp-app/package.json apps/mcp-app/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/mcp/package.json services/mcp/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.3.14-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV INTERNAL_MCP_URL=http://127.0.0.1:3000/mcp
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/mcp/node_modules ./services/mcp/node_modules
COPY --from=build /app/services/mcp/src ./services/mcp/src
COPY --from=build /app/apps/mcp-app/dist ./apps/mcp-app/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3000/api/status'); if (!response.ok) process.exit(1)"]

CMD ["bun", "services/mcp/src/production.ts"]
