FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

COPY crontab /etc/cron.d/tutoring-record
RUN chmod 0644 /etc/cron.d/tutoring-record && crontab /etc/cron.d/tutoring-record

RUN chmod +x entrypoint.sh

RUN mkdir -p logs

EXPOSE 85

CMD ["./entrypoint.sh"]
