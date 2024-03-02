FROM node:20-alpine as build
WORKDIR /usr/src/app
COPY ./package.json ./
RUN npm install --omit=dev

FROM gcr.io/distroless/nodejs20-debian12 as runtime
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY ./dist/ ./
CMD [ "index.js" ]