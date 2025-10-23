# Use Node.js LTS version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Install dev dependencies for build
RUN npm install --save-dev typescript tsc-alias

# Build the application
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create data directory for volume mount
RUN mkdir -p /app/data

# Start the application
CMD ["npm", "start"]