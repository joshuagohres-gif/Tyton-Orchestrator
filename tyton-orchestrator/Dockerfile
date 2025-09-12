# Tyton Orchestrator Production Dockerfile
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache libc6-compat curl

# Set working directory
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies
RUN npm ci --only=production --prefer-offline --no-audit && npm cache clean --force

# Install all dependencies for build
FROM base AS build-deps
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --prefer-offline --no-audit

# Build application
FROM build-deps AS builder
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# Production runtime
FROM base AS runner

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Set correct permissions
RUN chown -R nextjs:nodejs /app
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Expose port
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start application
CMD ["node", "server.js"]