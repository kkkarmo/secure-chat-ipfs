# Multi-stage build for production optimization
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --chown=nodeuser:nodejs src/ ./src/
COPY --chown=nodeuser:nodejs package*.json ./
COPY --chown=nodeuser:nodejs .env.example ./.env
RUN mkdir -p logs && chown nodeuser:nodejs logs
USER nodeuser
EXPOSE 3000 3001
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
