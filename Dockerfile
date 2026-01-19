# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build both client and server
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built server
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package*.json ./server/

# Copy built client (served by server)
COPY --from=builder /app/client/dist ./client/dist

# Install production dependencies only
WORKDIR /app/server
RUN npm install --production

# Expose port
EXPOSE 3333

# Start server
CMD ["node", "dist/index.js"]
