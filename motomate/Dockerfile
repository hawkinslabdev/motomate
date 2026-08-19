# Build stage
FROM node:24-alpine AS build

ARG BUILD_VERSION
ENV VITE_APP_VERSION=${BUILD_VERSION}

WORKDIR /app

# Install build tools required by better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Rebuild native modules for the container environment
RUN npm rebuild better-sqlite3

# Build the application
RUN npm run build

# Drop devDependencies now that the build is donee
RUN npm prune --omit=dev --omit=optional

# Runtime stage
FROM node:24-alpine AS runtime

WORKDIR /app

# Create directories for persistent data
RUN mkdir -p /app/data /app/uploads

# Copy production node_modules from build stage (here I got devDependencies already pruned)
COPY --from=build /app/node_modules ./node_modules

# Copy build artifacts from build stage
COPY --from=build /app/build ./build
COPY --from=build /app/server.js ./
COPY --from=build /app/migrate.js ./
COPY --from=build /app/demo-seed.js ./
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/static/demo-assets ./static/demo-assets

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/motomate.db
ENV STORAGE_LOCAL_PATH=/app/uploads

# Expose port
EXPOSE 3000

# Start server; server.js applies migrations before listening.
CMD ["node", "server.js"]
