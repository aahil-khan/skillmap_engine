# Use the official Node.js 18 LTS (Alpine) image for smaller size and better security
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Use existing node user (UID 1000) to match host user permissions
# No need to create a new user since node user already exists with UID 1000

# Install dependencies for PDF processing and text extraction
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    poppler-utils \
    binutils

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create uploads directory and set permissions
RUN mkdir -p uploads && \
    chown -R node:node /usr/src/app && \
    chmod -R 755 /usr/src/app

# Switch to non-root user
USER node

# Expose port
EXPOSE 5005

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5005/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["npm", "start"]