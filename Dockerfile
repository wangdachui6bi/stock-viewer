FROM node:20-alpine AS base
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app

# --- Dependencies (all, including dev) ---
FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

# --- Build frontend + compile server ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build
RUN npx esbuild server/index.ts \
      --bundle --platform=node --format=esm \
      --packages=external \
      --outfile=server-compiled/index.mjs

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server-compiled ./server-compiled

EXPOSE 3001
CMD ["node", "server-compiled/index.mjs"]
