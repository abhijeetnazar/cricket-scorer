# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html/cricket-scorer

# nginx config: serve the SPA under /cricket-scorer/ with correct routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
