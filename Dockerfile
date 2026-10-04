FROM node:22-slim

ENV NODE_ENV=production \
    TZ=Asia/Ho_Chi_Minh

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY admin ./admin

# Database & backups live in a volume
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]

# HTTP server (GET /health, admin web and optional webhooks) runs when
# admin web, SePay or Telegram webhook configuration is present.
EXPOSE 3000

CMD ["node", "src/bot.js"]
