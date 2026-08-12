FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

ENV TZ=America/Fortaleza

RUN apt-get update \
    && apt-get install -y cron tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Instala o agendamento no crontab do root.
# (arquivos em /etc/cron.d exigem o campo de usuário na linha e não são usados aqui)
RUN crontab /app/crontab

RUN chmod +x entrypoint.sh

RUN mkdir -p logs

CMD ["./entrypoint.sh"]
