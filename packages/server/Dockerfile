FROM node:22-alpine

# Upgrade packages to fix known vulnerabilities in the base alpine image
RUN apk upgrade --no-cache

WORKDIR /app

# Copy root manifest and lockfile
COPY package.json package-lock.json ./

# Copy workspace package.jsons
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install dependencies for all workspaces
RUN npm ci

# Copy server source code
COPY packages/server packages/server

# Set working directory to the server package
WORKDIR /app/packages/server

# Expose the default WebSocket port
EXPOSE 1234

# Use the production start script
CMD ["npm", "start"]
