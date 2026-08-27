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
# scripts/migrate.js lê os .sql daqui (path.join(__dirname, '..', 'src', ...))
# — sem isso o container builda e sobe normal, mas `npm run db:migrate`
# falha silenciosamente por não achar migração nenhuma pra aplicar.
COPY --from=build /app/src/shared/database/migrations ./src/shared/database/migrations
EXPOSE 3000
CMD ["node", "dist/main"]
