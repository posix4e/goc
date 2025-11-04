# Simple production image for the Node SSE server
FROM node:20-alpine AS base
WORKDIR /app

# Install only production deps (none currently)
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund || npm ci --omit=dev --no-audit --no-fund

# Copy app
COPY . .

ENV NODE_ENV=production
# Fly.io provides PORT; default to 8080 in containers
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]

