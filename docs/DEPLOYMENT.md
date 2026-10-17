# Publicar Los Santos en internet (costo cero)

## Qué conviene y por qué

La app es **un solo proceso Node.js con SQLite en disco**, avisos en tiempo real (SSE) y fotos en `data/uploads`. Necesita un servidor encendido todo el día con disco que no se borre. Eso descarta varias opciones “gratis” populares:

| Opción | ¿Sirve tal cual? | Motivo |
| --- | --- | --- |
| **Oracle Cloud Always Free (VM Ampere A1)** | **Sí — recomendada** | VM propia, 200 GB de disco persistente, 10 TB/mes de salida. Corre `compose.yaml` sin cambios. |
| Google Cloud e2-micro (Always Free) | Sí, con límites | 1 GB de RAM (requiere swap) y solo 1 GB/mes de salida hacia México; las fotos del menú pueden pasarlo y se cobra. Regiones gratuitas solo en EE. UU. |
| Equipo del negocio + Cloudflare Tunnel | Sí | Gratis, pero depende de la luz/internet del local y requiere un dominio en Cloudflare (~US$10/año). |
| Render / Railway / Koyeb gratis | No | Se duermen o pierden el disco al reiniciar: se borrarían pedidos. |
| Cloudflare Workers + D1 / Supabase | No sin reescribir | Habría que rehacer la capa de datos y el tiempo real; Supabase pausa proyectos gratuitos inactivos. |

**Arquitectura recomendada ($0):** Oracle Always Free → Docker Compose (app + Caddy con HTTPS automático) → subdominio gratuito de DuckDNS → respaldos automáticos a Cloudflare R2 o Backblaze B2 (10 GB gratis).

Un dominio propio (`lossantospedidos.com` o similar) es opcional y cuesta alrededor de US$10/año; se puede añadir después sin tocar la app.

> Límites vigentes al revisar esta guía (octubre 2026): Oracle redujo en junio de 2026 el Always Free de Ampere A1 a **2 OCPU y 12 GB de RAM** en total. La app necesita mucho menos. Oracle puede recuperar instancias Always Free “inactivas” si durante 7 días el CPU (p95), la red **y la memoria** están por debajo del 20 %. Crea la VM con **1 OCPU y 2 GB** para que el uso de memoria quede por encima de ese umbral, y revisa la [documentación de Oracle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm) por si cambia.

## 1. Crear la VM en Oracle Cloud

1. Crea una cuenta en cloud.oracle.com (pide tarjeta para verificar identidad; no cobra dentro de Always Free). Elige como región de origen la más cercana (p. ej. Querétaro o Monterrey).
2. **Compute → Instances → Create**: imagen **Ubuntu 24.04**, forma **VM.Standard.A1.Flex** con **1 OCPU / 2 GB**. Descarga la llave SSH.
3. **Networking → Virtual Cloud Network → Security List**: agrega reglas de entrada TCP **80** y **443** desde `0.0.0.0/0`.
4. Copia la IP pública de la VM.

### Alternativa: Google Cloud e2-micro

1. **Compute Engine → VM instances → Create instance**: región `us-central1` (u otra de las tres gratuitas), tipo **e2-micro**, disco **Ubuntu 24.04 LTS** estándar de 30 GB como máximo.
2. Marca **Allow HTTP traffic** y **Allow HTTPS traffic**. En **VPC network → IP addresses** reserva la IP externa como **estática** (sin usar sí se cobra).
3. Conéctate por SSH y agrega 2 GB de swap antes de compilar:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

4. Sigue desde el paso 3 de esta guía (`scripts/oracle-setup.sh` también sirve en Google Cloud; ahí el firewall interno ya está abierto). Configura una alerta de presupuesto de US$1.

## 2. Subdominio gratuito (DuckDNS)

1. Entra a duckdns.org con tu cuenta de Google/GitHub y crea, por ejemplo, `lossantos` → `lossantos.duckdns.org`.
2. Escribe la IP pública de la VM y guarda.

## 3. Instalar la app en la VM

```bash
ssh -i llave.key ubuntu@IP_DE_LA_VM
git clone <tu repositorio> los-santos   # o sube el ZIP con scp y descomprímelo
cd los-santos
bash scripts/oracle-setup.sh            # instala Docker, abre 80/443 y crea .env
nano .env
```

En `.env` define como mínimo:

```
OWNER_USERNAME=dueno
OWNER_PASSWORD=una-contraseña-larga-de-12+
DOMAIN=lossantos.duckdns.org
PUBLIC_URL=https://lossantos.duckdns.org
VAPID_SUBJECT=mailto:correo-real-del-negocio@gmail.com
```

Luego:

```bash
sudo docker compose up -d --build
curl https://lossantos.duckdns.org/api/health
```

Caddy obtiene el certificado HTTPS solo. Después de entrar por primera vez a `/personal`, **borra `OWNER_PASSWORD` del `.env`** (las cuentas ya quedaron guardadas en la base).

## 4. Respaldos fuera del servidor

La app ya hace respaldos cada 6 h en el disco. Para que además se copien solos a otro lugar:

### Opción A: Cloudflare R2 (10 GB gratis, sin cobro por descarga)

1. dash.cloudflare.com → **R2** → crea el bucket `los-santos-respaldos` (puede pedir método de pago para activar R2; dentro de 10 GB no cobra).
2. **R2 → Manage API tokens → Create API token** con permiso *Object Read & Write* solo para ese bucket. Copia *Access Key ID*, *Secret Access Key* y el endpoint `https://<ID>.r2.cloudflarestorage.com`.
3. En el bucket → **Settings → Object lifecycle rules**: borrar objetos con prefijo `los-santos/backups/` después de 60 días. **No** pongas regla al prefijo `los-santos/uploads/` (son las fotos).

### Opción B: Backblaze B2 (10 GB gratis, sin tarjeta)

Crea un bucket privado y una *Application Key* limitada a él. El endpoint es `https://s3.<región>.backblazeb2.com` y la región es la del endpoint (p. ej. `us-west-004`).

### Opción C: Google Drive con rclone (15 GB gratis, sin tarjeta)

`scripts/respaldo-externo.sh` copia el último respaldo y las fotos fuera del contenedor y, con rclone, a Google Drive (u OneDrive, Dropbox, etc.):

1. `sudo apt install -y rclone` y `rclone config` → nuevo → nombre `drive` → tipo `drive`, alcance `drive.file`. Cuando pregunte por navegador responde `n` y ejecuta en tu computadora el comando `rclone authorize ...` que te indica.
2. Prueba: `RCLONE_DESTINO=drive:LosSantos/respaldos sh scripts/respaldo-externo.sh`
3. Prográmalo cada 6 horas con `crontab -e`:

```cron
20 */6 * * * cd /home/ubuntu/los-santos && RCLONE_DESTINO=drive:LosSantos/respaldos sh scripts/respaldo-externo.sh >> respaldos-externos/registro.log 2>&1
```

Se conservan 14 días en el servidor y 60 en Drive (`DIAS_LOCALES`, `DIAS_REMOTOS`). Puedes usar esta opción además de R2/B2.

### Configurar R2 o B2 en la app

```
BACKUP_S3_ENDPOINT=https://<ID>.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=los-santos-respaldos
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_REGION=auto
```

`sudo docker compose up -d` y en **Administración → Respaldos** pulsa **Respaldar y enviar ahora**. Debe aparecer “Última copia correcta”. Desde entonces, cada respaldo automático y cada foto nueva se copian solos; las fotos se envían una sola vez.

### Restaurar en otra máquina

1. Descarga del bucket el `.sqlite` más reciente de `backups/` y la carpeta `uploads/`.
2. Con la app detenida: `node scripts/restore-backup.js ruta/al/respaldo.sqlite` y copia las fotos a `data/uploads/`.
   Con Docker: copia ambos al volumen (`docker compose cp`) y ejecuta el script dentro del contenedor con la app detenida.

## 5. App Android de Cocina (opcional)

Con el sitio ya publicado en HTTPS puedes generar gratis un APK que abre `/personal` y hace sonar los pedidos nuevos por el canal de **alarma** de Android a volumen máximo. Pasos en [ANDROID.md](ANDROID.md).

## 6. Monitoreo gratuito

Crea un monitor HTTP en uptimerobot.com (gratis) hacia `https://lossantos.duckdns.org/api/health` cada 5 minutos con aviso por correo o Telegram. Así sabrás si el servidor se cae antes que tus clientes. Las peticiones del monitor también cuentan como actividad para la VM.

## 7. Alternativa: equipo del negocio + Cloudflare Tunnel

Útil si prefieres no depender de Oracle. Necesitas un dominio en Cloudflare.

1. Cloudflare → **Zero Trust → Networks → Tunnels → Create** → tipo *Cloudflared* → copia el token.
2. En el túnel agrega un *Public hostname*: `pedidos.tudominio.com` → servicio `http://app:3000`.
3. En `.env`: `CLOUDFLARE_TUNNEL_TOKEN=...`, `PUBLIC_URL=https://pedidos.tudominio.com`, `TRUST_PROXY=cloudflare`.
4. `docker compose --profile tunnel up -d --build app tunnel` (no se abre ningún puerto del router).

## 8. Actualizar sin perder datos

```bash
cd los-santos
git pull                      # o reemplaza los archivos del código
sudo docker compose up -d --build
```

Los volúmenes `pedidos_data` (base, respaldos y fotos) y `caddy_data` (certificados) se conservan. **Nunca** uses `docker compose down -v`. La migración de base crea un respaldo previo automáticamente.

## Red saliente necesaria

`api.mercadopago.com` (pagos), proveedores Web Push (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`) y tu almacenamiento de respaldos. La VM de Oracle lo permite por defecto.
