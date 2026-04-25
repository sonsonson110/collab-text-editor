FROM node:22-alpine AS builder

# Upgrade packages to fix known vulnerabilities
RUN apk upgrade --no-cache

WORKDIR /app

# Copy root manifests
COPY package.json package-lock.json ./

# Copy workspace package.jsons
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install dependencies for all workspaces
RUN npm ci

# Copy the rest of the client source
COPY packages/client packages/client

WORKDIR /app/packages/client

# Accept build arguments for Vite environment variables
ARG VITE_WS_URL
ARG VITE_ROOM_NAME

# Set environment variables for the build step
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_ROOM_NAME=$VITE_ROOM_NAME

# Build the client
RUN npm run build

# Production stage using Nginx
FROM nginx:alpine

# Upgrade packages to fix known vulnerabilities
RUN apk upgrade --no-cache

# Copy built assets from builder stage
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
