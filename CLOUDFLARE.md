# Publicar Los Santos en Cloudflare (gratis, sin servidor)

La app corre completa en el plan **Workers Free** de Cloudflare:

- **Interfaz**: archivos estáticos de `dist/` (gratis y sin límite de visitas).
- **API, base de datos y fotos**: un Durable Object llamado `Tienda` con su propia base SQLite (`cloudflare/worker.js`). Usa el mismo código que el servidor Node (`server/app.js`).
- **Tiempo real** (Cocina recibe pedidos al instante): WebSocket con hibernación, que no consume tiempo mientras nadie hace pedidos.
- **Avisos push**: Web Push con WebCrypto (`cloudflare/webpush.js`).
- **Respaldos**: automáticos cada 6 h dentro de la base (se descargan como `.json` y se restauran desde Administración → Respaldos). Cloudflare además guarda 30 días de historial de la base. Opcional: copia externa a R2/B2 con las variables `BACKUP_S3_*`.

Límites del plan gratis que aplican (revisados en octubre de 2026): 100 000 peticiones al día, 13 000 GB-s de duración y 100 000 filas escritas al día en Durable Objects, 5 GB de almacenamiento. Un negocio local queda muy por debajo. Al pasar un límite, las operaciones fallan hasta las 18:00 hora del centro de México (00:00 UTC); nunca se cobra sin que cambies de plan.

## Publicar desde GitHub (recomendado)

1. Entra a **dash.cloudflare.com** → **Workers y Pages** → **Crear** → **Importar un repositorio**.
2. Conecta GitHub y elige `apexdevbrand-wq/pedidos`, rama **`cloudflare-workers`**.
3. Configuración de compilación:
   - Nombre del proyecto: `los-santos` (debe coincidir con `wrangler.jsonc`).
   - Comando de compilación: `npm run build`
   - Comando de despliegue: `npx wrangler deploy`
4. Pulsa **Guardar y desplegar**. Cada `git push` a esa rama vuelve a publicar solo.
5. En el Worker → **Configuración → Variables y secretos**, agrega como **Secreto**:
   - `OWNER_PASSWORD`: contraseña inicial del usuario `dueno` (12+ caracteres).
   - `STAFF_PASSWORD`: contraseña inicial del usuario `cocina` (opcional).
   Vuelve a desplegar. Las cuentas se crean la primera vez; después se administran en **Administración → Equipo**. Puedes borrar estos secretos cuando ya entraste.
6. Abre `https://los-santos.<tu-subdominio>.workers.dev`. El equipo entra por `/personal`.

## Publicar desde tu computadora (alternativa)

```bash
npm ci
npx wrangler login
npm run deploy:cloudflare
npx wrangler secret put OWNER_PASSWORD
```

## Dominio

`*.workers.dev` es gratis y trae HTTPS. Los subdominios de DuckDNS no se pueden conectar a Workers (DuckDNS no admite registros CNAME y Cloudflare exige que el dominio esté en tu cuenta). Para un nombre propio (por ejemplo `lossantosmina.com`, unos US$10 al año) agrégalo a Cloudflare y en el Worker → **Configuración → Dominios y rutas → Agregar dominio personalizado**.

## Variables opcionales

| Variable | Para qué |
| --- | --- |
| `OWNER_RESET_PASSWORD` (secreto) | Recuperar el acceso del dueño: se aplica una vez; luego bórrala. |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (secretos), `PUBLIC_URL` | Activar Mercado Pago. |
| `VAPID_SUBJECT` | Contacto del negocio para los avisos push (ya configurado en `wrangler.jsonc`). |
| `BACKUP_S3_*` | Copia externa de respaldos y fotos (R2 o Backblaze B2). |
| `PBKDF2_ITERATIONS` | Costo del cifrado de contraseñas (30 000 por defecto para caber en el límite de CPU del plan gratis). |

## Probar en tu computadora

```bash
npm run dev:cloudflare        # corre la versión Cloudflare en http://localhost:8787
npm run test:cloudflare       # las pruebas automáticas contra esa versión
```

## Diferencias con el servidor propio (Node/Docker)

- Respaldos en formato `.json` (en Node son archivos `.sqlite`); se restauran desde el panel.
- Fotos subidas de hasta 1.8 MB (el panel las reduce antes de subirlas).
- Para recuperar al dueño se usa `OWNER_RESET_PASSWORD` en lugar de `npm run reset-owner`.
- La versión con servidor propio sigue disponible: `docs/DEPLOYMENT.md` (Oracle/Docker) y `compose.cloudflare.yaml` (Cloudflare Tunnel hacia un servidor propio).
