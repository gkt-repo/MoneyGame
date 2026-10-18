# ─── Stage 1: Build Stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install openssl & libc compatibility for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy workspace package manifests
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/server/package*.json ./apps/server/
COPY apps/admin-web/package*.json ./apps/admin-web/
COPY apps/user-web/package*.json ./apps/user-web/

# Install all dependencies across workspaces
RUN npm ci

# Copy shared-types code and build it first
COPY packages/shared-types ./packages/shared-types
RUN npm --prefix packages/shared-types run build

# Copy Prisma schema and generate Prisma client for compilation
COPY apps/server/prisma ./apps/server/prisma
RUN npx prisma generate --schema=apps/server/prisma/schema.prisma

# Copy server code and build TypeScript
COPY apps/server/src ./apps/server/src
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
RUN npm --prefix apps/server run build

# ─── Stage 2: Production Runner ───────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

# Install openssl & libc compatibility for Prisma runtime
RUN apk add --no-cache openssl libc6-compat

# Copy workspace package manifests
COPY package*.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/server/package*.json ./apps/server/
COPY apps/admin-web/package*.json ./apps/admin-web/
COPY apps/user-web/package*.json ./apps/user-web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled shared-types
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

# Copy Prisma schema files
COPY apps/server/prisma ./apps/server/prisma

# Copy compiled server code and static assets
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY apps/server/public ./apps/server/public

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

WORKDIR /app/apps/server

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
