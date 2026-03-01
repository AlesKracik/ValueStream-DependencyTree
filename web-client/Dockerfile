# Use Node.js as the base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (default Vite port is 5173)
EXPOSE 5173

# Start the application in dev mode to keep the persistence plugin active
# We use --host to allow external access within Docker network
CMD ["npm", "run", "dev", "--", "--host"]
