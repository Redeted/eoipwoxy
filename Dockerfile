FROM node:18-bullseye-slim

# Install any required system packages
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# Create the app directory
WORKDIR /app

# Copy all project files into the container
COPY . .

# Ensure necessary permissions, if needed
RUN chown -R 1000:1000 /app
USER 1000

# Install npm dependencies
RUN npm install

# Build the app
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Expose the port your app uses
EXPOSE 7860

# Start the app
CMD [ "npm", "start" ]
