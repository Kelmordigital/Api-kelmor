# Estagio 1: compila o TypeScript a partir do src (o dist versionado no git nao e mais usado)
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
# npm install (e nao npm ci): o package-lock.json esta fora de sincronia com o package.json
RUN npm install

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Estagio 2: imagem final, so com dependencias de producao + o dist recem-compilado
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY drizzle.config.ts ./

EXPOSE 3000

CMD ["node", "dist/main.js"]
