#!/bin/bash

# Carrega variáveis de ambiente no cron
printenv | grep -v "no_proxy" >> /etc/environment

# Inicia o cron
service cron start

echo "Agendador iniciado — bot roda todo dia às 15h"
echo "Logs em /app/logs/cron.log"

# Roda imediatamente ao iniciar o container
echo "Executando bot agora (inicialização)..."
node src/main.js

# Mantém o container vivo para o cron funcionar nos próximos dias
tail -f /dev/null
