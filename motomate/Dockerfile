# Build stage
FROM node:20-slim AS build

WORKDIR /app

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

# Runtime stage
FROM node:20-slim AS runtime

WORKDIR /app

# Create directories for persistent data
RUN mkdir -p /app/data /app/uploads

# Copy node_modules from build stage (includes drizzle-kit and all deps)
COPY --from=build /app/node_modules ./node_modules

# Copy build artifacts from build stage
COPY --from=build /app/build ./build
COPY --from=build /app/server.js ./
COPY --from=build /app/migrate.js ./
COPY --from=build /app/drizzle ./drizzle

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/motomate.db
ENV STORAGE_LOCAL_PATH=/app/uploads

# Expose port
EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "node migrate.js && node server.js"]
