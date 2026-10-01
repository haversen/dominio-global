# Imagen para Fly.io, Railway, un VPS o cualquier servicio que acepte Docker.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY public ./public
# Carpeta para guardar las partidas en marcha (si no se usa Upstash).
RUN mkdir -p /app/data && chown node:node /app/data
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
