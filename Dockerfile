FROM node:23-alpine as build
WORKDIR /usr/src/app
COPY ./package.json ./
RUN npm install
COPY ./src ./src
COPY ./tsconfig.json ./
RUN npm run build

FROM node:23-alpine as install
WORKDIR /usr/src/app
COPY ./package.json ./
RUN npm install --omit=dev

# use node:20-alpine for debugging
# FROM node:20-alpine
FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/dist/ ./
COPY --from=install /usr/src/app/node_modules ./node_modules

HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=10 CMD [ "/nodejs/bin/node", "healthCheck.js" ]
CMD [ "index.js" ]