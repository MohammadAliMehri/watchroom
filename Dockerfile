# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
# Optional corporate/build proxy CA, supplied as a BuildKit secret (never stored).
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates iptables util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system watchroom \
    && useradd --system --gid watchroom --home-dir /app --shell /usr/sbin/nologin watchroom
ENV NODE_ENV=production PORT=3000 MEDIA_DIR=/app/media DB_PATH=/app/data/watchroom.db
COPY package*.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund
COPY server.js ./
COPY lib/ ./lib/
COPY routes/ ./routes/
COPY src/ ./src/
COPY db/ ./db/
COPY --from=web-builder /app/web/dist ./public
COPY scripts/watchroom-egress.sh /usr/local/bin/watchroom-egress
COPY scripts/docker-entrypoint.sh /usr/local/bin/watchroom-entrypoint
RUN chmod 755 /usr/local/bin/watchroom-egress /usr/local/bin/watchroom-entrypoint \
    && chmod -R a+rX /app \
    && mkdir -p /app/media /app/data \
    && chown watchroom:watchroom /app/media /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e 'fetch("http://localhost:3000/healthz").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
ENTRYPOINT ["/usr/local/bin/watchroom-entrypoint"]
CMD ["node", "server.js"]
