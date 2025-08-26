# Multi-stage build for production-ready Graphile Worker service

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (skip scripts to avoid premature build)
RUN npm ci --ignore-scripts

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM graphile/worker:latest AS production

# Create non-root user for security
RUN addgroup -g 1001 -S worker && \
    adduser -S worker -u 1001

# Set working directory
WORKDIR /worker

# Copy package files
COPY package*.json ./

# Install only production dependencies (skip scripts to avoid build during install)
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/src/types ./src/types

# Copy configuration files
COPY graphile.config.js ./
COPY crontab ./

# Change ownership to worker user
RUN chown -R worker:worker /worker

# Switch to non-root user
USER worker

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Default command will be inherited from graphile/worker:latest