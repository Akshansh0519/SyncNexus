# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# nginx config: SPA routing + API/WS proxy to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
