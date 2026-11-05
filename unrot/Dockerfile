# Unrot: one small Node process serving the API and the app.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data TRUST_PROXY=1
COPY --from=build /app/dist ./dist
COPY package.json ./
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.mjs"]
