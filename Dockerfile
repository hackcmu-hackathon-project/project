# The Expo web build, served as static files.
#
# EXPO_PUBLIC_* values are compiled into the bundle, so the API URL has to be
# present at build time — Railway passes service variables to the builder.
FROM node:22-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_AUTH0_DOMAIN
ARG EXPO_PUBLIC_AUTH0_CLIENT_ID
ARG EXPO_PUBLIC_AUTH0_AUDIENCE
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_AUTH0_DOMAIN=$EXPO_PUBLIC_AUTH0_DOMAIN \
    EXPO_PUBLIC_AUTH0_CLIENT_ID=$EXPO_PUBLIC_AUTH0_CLIENT_ID \
    EXPO_PUBLIC_AUTH0_AUDIENCE=$EXPO_PUBLIC_AUTH0_AUDIENCE

RUN npx expo export --platform web

FROM node:22-slim
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
ENV PORT=8081
# -s so a deep link falls back to index.html rather than 404ing.
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]
