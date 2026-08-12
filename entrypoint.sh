#!/bin/bash

# O cron não herda o ambiente do container. Exporta as variáveis em um arquivo
# que cada tarefa carrega antes de rodar (export -p já sai com as aspas corretas).
export -p | grep -v "no_proxy" > /app/.cron-env
chmod 600 /app/.cron-env

# Inicia o cron
service cron start

echo "Agendador iniciado — fuso ${TZ:-UTC}, agora são $(date '+%d/%m/%Y %H:%M')"
echo "Agenda: Seg/Sex 18:50 | Ter/Qua/Qui 17:20 | Sáb 11:50"
echo "Logs em /app/logs/cron.log"

# Execução imediata só quando pedida — evita cadastrar de novo a cada restart
# do container (reboot da VPS, docker compose up, etc).
if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "RUN_ON_START=true — executando o bot agora..."
  node src/main.js || echo "Execução inicial falhou — o agendamento continua ativo."
fi

# Mantém o container vivo para o cron funcionar nos próximos dias
tail -f /dev/null
