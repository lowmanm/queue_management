# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx nx build agent-workspace --configuration=production

# Stage 2: Runtime (nginx)
FROM nginx:alpine
COPY --from=builder /app/dist/apps/agent-workspace/browser /usr/share/nginx/html
COPY apps/agent-workspace/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
