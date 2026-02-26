FROM node:22-bullseye AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @kit3d/web build

FROM nginx:1.27-alpine

ENV REACT_APP_BACK_URL=/api

RUN apk add --no-cache nodejs npm \
  && npm install -g react-inject-env@2.1.0

COPY --from=build /app/packages/web/build /app/build
COPY serve/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["sh", "-c", "react-inject-env set -d /app/build || true; nginx -g 'daemon off;'"]
