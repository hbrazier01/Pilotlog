FROM node:20-alpine
WORKDIR /app

# Install deps (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy source
COPY . .

ENV PILOTLOG_HOME=/app/data
ENV PORT=8788

ENV PORT=8788
ENV PILOTLOG_HOME=/app/data

EXPOSE 8788

CMD ["node", "pilotlog-cli/src/readApi.mjs"]
