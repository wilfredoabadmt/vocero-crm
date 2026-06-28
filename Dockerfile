# ---- Stage 1: build web ----
FROM node:22-alpine AS web-build
WORKDIR /app
COPY . .
RUN npm install --include=dev --ignore-scripts
RUN npm rebuild
RUN cd web && tsc -p tsconfig.json --noEmit && vite build

# ---- Stage 2: build server ----
FROM node:22-alpine AS server-build
WORKDIR /app
COPY . .
RUN npm install --include=dev --ignore-scripts
RUN npm rebuild
RUN npm run build -w server

# ---- Stage 3: runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --workspace server --omit=dev --include-workspace-root && npm cache clean --force

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/drizzle ./server/drizzle
COPY --from=web-build /app/web/dist ./web/dist

RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node

EXPOSE 3000
ENV UPLOADS_DIR=/data/uploads
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
