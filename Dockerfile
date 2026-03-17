# 1. Use Microsoft's official Playwright image (has ALL the Linux drivers pre-installed!)
FROM mcr.microsoft.com/playwright:v1.42.0-jammy

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy your package.json files
COPY package*.json ./

# 4. Install your Node modules
RUN npm install

# 5. Copy the rest of your server files and frontend UI
COPY . .

# 6. Expose the port Railway expects
EXPOSE 8080

# 7. Start the server!
CMD ["npm", "start"]
