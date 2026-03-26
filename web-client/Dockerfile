# Use Node.js as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy and build shared types first
COPY shared/types/package*.json shared/types/
RUN cd shared/types && npm install
COPY shared/types/ shared/types/
RUN cd shared/types && npm run build

# Copy web-client package.json and install dependencies
COPY web-client/package*.json web-client/
RUN cd web-client && npm install

# Copy the rest of the web-client code
COPY web-client/ web-client/

# Expose the port the app runs on (default Vite port is 5173)
EXPOSE 5173

# Start the application in dev mode, bound to all interfaces
WORKDIR /app/web-client
CMD ["npm", "run", "dev", "--", "--host"]
