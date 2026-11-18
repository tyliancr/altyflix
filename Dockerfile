FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server

ENV NODE_ENV=production \
    PORT=3000 \
    TRUST_PROXY=1

USER node

EXPOSE 3000

CMD ["node", "server/server-vf-api.cjs"]
