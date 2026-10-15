# syntax=docker/dockerfile:1

# Stage 1: Build Frontend Assets
FROM node:22-bookworm-slim AS web-builder
WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# Stage 2: Production Server Runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install FFmpeg, ffprobe, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Set production environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    MEDIA_DIR=/app/media \
    MEDIA_EGRESS_PROTECTED=true \
    ALLOW_UNSAFE_MEDIA_FETCHES=true

# Copy package manifests and install server dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY server.js ./
COPY lib/ ./lib/
COPY routes/ ./routes/
COPY src/ ./src/
COPY db/ ./db/

# Copy built frontend assets from web-builder
COPY --from=web-builder /app/public ./public

# Prepare persistent media and database storage directories
RUN mkdir -p /app/media /app/data

EXPOSE 3000

# Health check against server healthz endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://localhost:3000/healthz").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["node", "server.js"]
