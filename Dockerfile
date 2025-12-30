# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI="true"

# Enable corepack to use pnpm
RUN corepack enable

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Copy workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package descriptors
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile --prod=false

# Copy application code
COPY . .

# Build shared package first
RUN pnpm --filter @manutencao/shared build

# Build api
RUN pnpm --filter @manutencao/api build

# Prune development dependencies
RUN pnpm prune --prod

# Final stage for app image
FROM base

# Copy built application and dependencies
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api /app/apps/api
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/package.json /app/package.json

# Expose port
EXPOSE 3000

# Start the server
# We need to run from the api directory or adjust the path
WORKDIR /app/apps/api
CMD [ "npm", "run", "start" ]
