# Use Node.js as the base image
FROM node:22-alpine

# Install git and aws-cli (required for AWS SSO login/credential fetching)
RUN apk add --no-cache git aws-cli

# Set working directory
WORKDIR /app

# Copy and build shared types first
COPY shared/types/package*.json shared/types/
RUN cd shared/types && npm install
COPY shared/types/ shared/types/
RUN cd shared/types && npm run build

# Copy backend package.json and install dependencies
COPY backend/package*.json backend/
RUN cd backend && npm install

# Copy the rest of the backend code
COPY backend/ backend/

# Build the TypeScript code
RUN cd backend && npm run build

# Expose the Fastify port
EXPOSE 4000

# Start the Fastify server
WORKDIR /app/backend
CMD ["npm", "start"]
