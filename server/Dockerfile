FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including local typescript version)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build using project's typescript version
RUN npx tsc

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
