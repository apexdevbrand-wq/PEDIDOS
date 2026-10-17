#!/usr/bin/env bash
# Prepara una VM Ubuntu (Oracle Cloud Always Free, Ampere A1) para Los Santos.
# Ejecútalo DENTRO de la VM, desde la carpeta del proyecto:
#   bash scripts/oracle-setup.sh
# Hace: instala Docker, abre 80/443 en el firewall interno de Ubuntu y
# programa el arranque automático. No toca tu .env ni tus datos.
set -euo pipefail

if [ ! -f compose.yaml ]; then
  echo "Ejecuta este script desde la carpeta del proyecto (donde está compose.yaml)." >&2
  exit 1
fi

echo "→ Actualizando paquetes"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl iptables-persistent

if ! command -v docker >/dev/null; then
  echo "→ Instalando Docker (script oficial de get.docker.com)"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Las imágenes de Ubuntu de Oracle bloquean todo excepto SSH con iptables.
# Además de esto, abre 80 y 443 en la "Security List" de la VCN (consola).
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    echo "→ Abriendo puerto $port"
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo netfilter-persistent save

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo
  echo "Se creó .env a partir de .env.example. Edítalo ahora (nano .env) y define:"
  echo "  OWNER_PASSWORD, DOMAIN, PUBLIC_URL, VAPID_SUBJECT y, si quieres, BACKUP_S3_*"
  echo "Luego ejecuta:  sudo docker compose up -d --build"
  exit 0
fi

echo "→ Construyendo e iniciando"
sudo docker compose up -d --build
sudo docker compose ps
echo
echo "Listo. Comprueba https://$(grep -E '^DOMAIN=' .env | cut -d= -f2)/api/health"
