FROM node:20-alpine
WORKDIR /app

# Install deps (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy source
COPY . .

# Set data path only (do NOT hardcode PORT)
ENV PILOTLOG_HOME=/app/data

# Expose port (for documentation only; Railway uses dynamic PORT)
EXPOSE 8788

# Start the app
CMD ["node", "pilotlog-cli/src/readApi.mjs"]
