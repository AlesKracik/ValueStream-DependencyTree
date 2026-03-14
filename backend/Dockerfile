# Use Node.js as the base image
FROM node:22-alpine

# Install git and aws-cli (required for AWS SSO login/credential fetching)
RUN apk add --no-cache git aws-cli

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the Fastify port
EXPOSE 3000

# Start the Fastify server
CMD ["npm", "start"]
