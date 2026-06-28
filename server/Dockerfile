FROM node:20-alpine

WORKDIR /app

# Copy lock files and package.json files
COPY package*.json ./

# Install packages
RUN npm ci --omit=dev

# Copy the rest of the application files
COPY . .

# Build TypeScript to Javascript
RUN npm install -g typescript && tsc

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
