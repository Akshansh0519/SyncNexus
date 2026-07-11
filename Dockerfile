FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate

FROM base AS api
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]

FROM base AS worker
CMD ["node", "src/worker.js"]
