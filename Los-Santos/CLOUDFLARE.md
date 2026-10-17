# Preparación para Cloudflare Tunnel

Esta app usa Node.js 24, SQLite, SSE y fotos en disco. Se ejecuta en un servidor propio con disco persistente; Cloudflare Tunnel publica ese servidor con HTTPS. No es un despliegue directo a Pages ni Workers.

## Configurar en el servidor definitivo

1. Instala Docker Engine y Docker Compose. Copia este proyecto al servidor.
2. Copia `.env.cloudflare.example` a `.env` solo si `.env` no existe. Protege el archivo con `chmod 600 .env`. Completa los valores localmente, sin subir credenciales a Git:
   - `OWNER_PASSWORD`: contraseña inicial larga y única.
   - `PUBLIC_URL`: URL HTTPS del subdominio, sin diagonal final.
   - `CLOUDFLARE_TUNNEL_TOKEN`: token del túnel, introducido solo en el servidor.
   - `VAPID_SUBJECT`: `mailto:` con el correo real de contacto.
3. En Cloudflare configura un túnel Cloudflared administrado remotamente y su hostname público. Destino HTTP: `http://app:3000`. El dominio debe estar activo en tu cuenta.
4. Ejecuta desde esta carpeta:

```sh
docker compose -f compose.yaml -f compose.cloudflare.yaml --profile tunnel config --quiet
docker compose -f compose.yaml -f compose.cloudflare.yaml --profile tunnel up -d --build app tunnel
```

El archivo adicional corrige `TRUST_PROXY`: el Compose original fija `1` aunque `.env` indique `cloudflare`. No publiques el puerto 3000 ni arranques el servicio `proxy` para este flujo. El volumen `pedidos_data` conserva base, fotos y respaldos. Nunca ejecutes `down -v`.

## Comprobar después de conectar Cloudflare

```sh
docker compose -f compose.yaml -f compose.cloudflare.yaml exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{if(!r.ok)process.exit(1);console.log(await r.json())})"
```

En el dominio público, `/api/health` debe devolver `ok: true`. Comprueba acceso a `/personal`, inicio de sesión, pedido de prueba y actualización de cocina en tiempo real. Configura una regla de caché para omitir `/api/*`; no bloquees callbacks de pago con Cloudflare Access. Después de verificar el primer acceso, elimina `OWNER_PASSWORD` del archivo: la cuenta ya está en SQLite. No elimines el volumen.

Configura respaldos externos antes de recibir pedidos reales; `docs/DEPLOYMENT.md` explica R2. Los respaldos locales no protegen contra pérdida del servidor.

## Validación en este entorno

Consulta `VALIDACION-CLOUDFLARE.txt`. No se ha publicado un túnel ni validado DNS o credenciales de Cloudflare. El alojamiento de onboarding es para desarrollo; requiere un servidor persistente para producción.
