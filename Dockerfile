FROM node:20-alpine AS base
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

# --- Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# --- Production ---
FROM base AS runner
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true && yarn cache clean

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

EXPOSE 3001
CMD ["yarn", "start"]
