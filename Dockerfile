# 1. Build stage (both frontend and backend)
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY frontend/ ./frontend/
COPY backend/ ./backend/

# Build both packages
RUN npm run build -w backend
RUN npm run build -w frontend

# 2. Production stage
FROM node:20-alpine
WORKDIR /app

# Copy package files for production install
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm ci --omit=dev -w backend

# Copy backend dist
COPY --from=builder /app/backend/dist ./dist

# Copy frontend build to public directory
COPY --from=builder /app/frontend/dist ./public

# Cloud Run uses PORT env var (default 8080)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
