FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY index.ts ./
COPY core/ ./core/
COPY config/ ./config/
COPY queue/ ./queue/
COPY match/ ./match/
COPY votes/ ./votes/
COPY draft/ ./draft/
COPY result/ ./result/
COPY cooldowns/ ./cooldowns/
COPY messaging/ ./messaging/
COPY bridge/ ./bridge/
COPY commands/ ./commands/
COPY interactions/ ./interactions/

RUN npm run build

CMD ["npm", "start"]
