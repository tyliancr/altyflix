FROM node:20-slim

# Installation de FFmpeg pour le transcodage audio Dolby (AC-3/E-AC-3 -> AAC) et AVI à la volée
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/server-vf-api.cjs"]
