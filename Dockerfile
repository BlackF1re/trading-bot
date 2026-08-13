FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src
COPY data ./data

RUN chown -R node:node /app
USER node

CMD ["node", "src/index.mjs"]
