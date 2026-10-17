#!/bin/sh
# Copia el respaldo más reciente fuera del contenedor y, si configuraste rclone, fuera del servidor.
# Ejecútalo desde la carpeta del proyecto en el servidor (donde está compose.yaml):
#   sh scripts/respaldo-externo.sh
# Variables opcionales:
#   RCLONE_DESTINO   destino de rclone, por ejemplo "drive:LosSantos/respaldos"
#   DIAS_LOCALES     días que se conservan en el servidor (14 por defecto)
#   DIAS_REMOTOS     días que se conservan en el destino remoto (60 por defecto)
set -eu
cd "$(dirname "$0")/.."
LOCAL=respaldos-externos
mkdir -p "$LOCAL"
chmod 700 "$LOCAL"

ULTIMO=$(docker compose exec -T app sh -c 'ls -t data/backups/*.sqlite 2>/dev/null | head -n 1')
if [ -z "$ULTIMO" ]; then
  echo "No hay respaldos dentro del contenedor. ¿Está encendida la app?" >&2
  exit 1
fi
NOMBRE=$(basename "$ULTIMO")
if [ ! -f "$LOCAL/$NOMBRE" ]; then
  docker compose cp "app:/app/$ULTIMO" "$LOCAL/$NOMBRE"
  chmod 600 "$LOCAL/$NOMBRE"
fi
echo "Respaldo local: $LOCAL/$NOMBRE"
find "$LOCAL" -name '*.sqlite' -mtime +"${DIAS_LOCALES:-14}" -delete

if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$LOCAL/$NOMBRE" "$RCLONE_DESTINO"
  rclone delete --min-age "${DIAS_REMOTOS:-60}d" --include '*.sqlite' "$RCLONE_DESTINO"
  echo "Copiado a $RCLONE_DESTINO"
else
  echo "Sin RCLONE_DESTINO: la copia sigue en este servidor. Descárgala o configura rclone." >&2
fi
