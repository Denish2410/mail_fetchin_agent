# Step 1: Build React Frontend
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Step 2: Production Server (Node + Python)
FROM node:22-slim

# Install Python3 and system dependencies for lxml / openpyxl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python packages
COPY version1.py ./
RUN pip3 install --no-cache-dir --break-system-packages requests beautifulsoup4 lxml openpyxl

# Install Server Node.js packages
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --production

# Copy server code and built frontend static assets
COPY server/ ./
COPY --from=client-builder /app/client/dist ./public

# Ensure upload and results directories exist
RUN mkdir -p uploads results

EXPOSE 5001

ENV PORT=5001
ENV NODE_ENV=production

CMD ["node", "server.js"]
