# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies needed for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy package.json for the start script
COPY package.json ./

# Copy only the dist folder from builder
COPY --from=builder /app/dist ./dist

# Set production environment
ENV NODE_ENV=production

# Expose the port (adjust if needed)
EXPOSE 3000

# Start the server
CMD ["bun", "run", "start"]

