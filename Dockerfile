FROM docker.io/node:18.15-buster-slim as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . ./
RUN npm run build

FROM docker.io/node:18.15-buster-slim as runner
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
