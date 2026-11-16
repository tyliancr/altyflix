FROM node:24-alpine

WORKDIR /app

# Copie des dépendances
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copie des fichiers sources du bot
COPY . .

# Port exposé pour le healthcheck cloud
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "bot-reaction.js"]
