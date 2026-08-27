# Build de produção — Dockerfile.dev é só para desenvolvimento (npm run
# start:dev com volume montado). Este gera a imagem que a pipeline builda e
# sobe na instância.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
# O `migrate.js` le os .sql daqui em RUNTIME (eles nao sao compilados para
# `dist`). Sem esta linha, `npm run db:migrate` dentro do container morre em
# "Pasta de migracoes nao encontrada" — e nao ha como migrar producao.
COPY --from=build /app/src/shared/database/migrations ./src/shared/database/migrations
EXPOSE 3000
CMD ["node", "dist/main"]
