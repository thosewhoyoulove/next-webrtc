FROM node:18-alpine

WORKDIR /app

COPY package.json ./

# Install dependencies
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
