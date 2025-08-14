# Multi-stage build for production optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src ./src

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && adduser -S gainforest -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=gainforest:nodejs /app/dist ./dist
COPY --from=builder --chown=gainforest:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=gainforest:nodejs /app/package*.json ./

# Create temp directory for downloads
RUN mkdir -p ./temp/downloads && chown gainforest:nodejs ./temp/downloads

# Switch to app user
USER gainforest

# Expose port for health checks
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node dist/main.js health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "dist/main.js", "process-all"]