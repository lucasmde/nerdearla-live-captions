FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
VOLUME ["/app/transcripts"]
CMD ["node", "server/index.js"]
