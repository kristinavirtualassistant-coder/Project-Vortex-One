FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["sh","-c","npm run db:migrate && npm run auth:migrate && npm start"]
