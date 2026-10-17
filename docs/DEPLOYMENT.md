# Servidor público y HTTPS

Para que clientes externos compren, la cocina reciba pedidos en otro dispositivo y funcionen push y Mercado Pago, la app necesita una máquina encendida con almacenamiento persistente y una dirección pública **HTTPS**. Esta guía usa una máquina virtual gratuita en **Oracle Cloud** o **Google Cloud** con Docker + Caddy. Caddy obtiene y renueva solo el certificado HTTPS.

**Qué se probó:** `docker compose up -d --build` con Caddy en `localhost`: redirección HTTP→HTTPS, inicio de sesión con cookie `Secure`, eventos en tiempo real de Cocina a través del proxy y `scripts/respaldo-externo.sh` copiando a un destino rclone con verificación de integridad. **No se probó:** crear la VM en Oracle o Google, DNS real ni certificado de Let's Encrypt. Los niveles gratuitos los definen los proveedores y pueden cambiar; revisa sus condiciones al registrarte.

## 1. Elegir proveedor

|                     | Oracle Cloud Always Free (recomendado)                                                                    | Google Cloud e2-micro                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Región              | Hay regiones en México (Querétaro, Monterrey)                                                             | Solo `us-west1`, `us-central1` o `us-east1` entran en el nivel gratuito               |
| Máquina             | Ampere ARM, hasta 4 CPU y 24 GB RAM en total                                                              | 2 vCPU compartidas, 1 GB RAM (necesita swap para compilar)                            |
| Tráfico de salida   | 10 TB al mes                                                                                              | 1 GB al mes; lo que exceda se cobra (las fotos del menú consumen la mayor parte)      |
| Riesgos             | El registro a veces se rechaza o no hay capacidad ARM; Oracle puede recuperar instancias gratuitas inactivas. Pasar la cuenta a Pago por uso (sin salir de los límites gratuitos) evita esa recuperación | Pide tarjeta; si cambias de tipo de máquina, región o disco, empieza a cobrar         |

Las dos piden tarjeta para verificar identidad. Configura una alerta de presupuesto en cualquiera de ellas.

## 2. Crear la máquina virtual

Necesitas una llave SSH. En Windows, macOS o Linux abre una terminal y ejecuta `ssh-keygen -t ed25519` (acepta la ruta por defecto). La llave pública queda en `~/.ssh/id_ed25519.pub`.

### Oracle Cloud

1. En la consola: **Compute → Instances → Create instance**.
2. Imagen: **Canonical Ubuntu 24.04**. Forma: **VM.Standard.A1.Flex** (Ampere), 1 OCPU y 6 GB bastan. Si aparece "Out of capacity", prueba otro dominio de disponibilidad o más tarde.
3. En **Add SSH keys** pega el contenido de `id_ed25519.pub`. Deja la IP pública asignada.
4. Al crearla, entra en la subred → **Security List** → **Add Ingress Rules**: origen `0.0.0.0/0`, TCP, puertos `80` y `443` (dos reglas o `80,443`).
5. Conéctate: `ssh ubuntu@IP_PUBLICA`. Las imágenes Ubuntu de Oracle traen un firewall interno; ábrelo:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

6. Para que la IP no cambie: **Networking → Reserved Public IPs** y asígnala a la instancia (gratis mientras esté en uso).

### Google Cloud

1. **Compute Engine → VM instances → Create instance**.
2. Región `us-central1` (u otra de las tres gratuitas), tipo **e2-micro**, disco de arranque **Ubuntu 24.04 LTS**, **disco persistente estándar** de 30 GB como máximo.
3. En **Firewall** marca **Allow HTTP traffic** y **Allow HTTPS traffic**.
4. En **VPC network → IP addresses** reserva la IP externa como **estática**. (Una IP estática sin usar sí se cobra).
5. Conéctate con el botón **SSH** de la consola o `gcloud compute ssh NOMBRE_VM`.
6. Agrega 2 GB de swap; sin esto la compilación puede quedarse sin memoria:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Dominio

Crea un registro DNS **A** que apunte a la IP pública de la VM, por ejemplo `pedidos.tudominio.com`. Si no tienes dominio, un subdominio gratuito como `tunegocio.duckdns.org` sirve. Comprueba con `ping pedidos.tudominio.com` que responde la IP correcta antes de seguir: Caddy necesita que el DNS ya apunte al servidor para emitir el certificado.

## 4. Instalar Docker y la app (en la VM)

```bash
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # vuelve a conectarte por SSH para que aplique el grupo
```

Sube el proyecto. Desde la VM, con el repositorio privado:

```bash
git clone https://github.com/apexdevbrand-wq/PEDIDOS.git lossantos
cd lossantos
git checkout entrega-los-santos
```

GitHub pedirá tu usuario y un token personal en lugar de la contraseña. Alternativa: sube el ZIP con `scp Los-Santos-proyecto.zip ubuntu@IP:` y descomprímelo con `unzip`.

Crea `.env`:

```bash
cp .env.example .env
nano .env
```

Rellena al menos:

```ini
OWNER_USERNAME=dueno
OWNER_PASSWORD=una-contraseña-larga-de-12-o-más
DOMAIN=pedidos.tudominio.com
PUBLIC_URL=https://pedidos.tudominio.com
VAPID_SUBJECT=mailto:contacto@tunegocio.com
```

Protege el archivo y arranca:

```bash
chmod 600 .env
docker compose up -d --build
docker compose logs -f   # espera "Los Santos listo"; Ctrl+C para salir del registro
```

Abre `https://pedidos.tudominio.com` y luego `/personal`. Ya con sesión, en Administración → Equipo crea las cuentas reales, y después borra `OWNER_PASSWORD` de `.env` (las contraseñas existentes no cambian al editar `.env`).

## 5. Comprobar antes de abrir al público

1. Catálogo y compra en efectivo desde un teléfono con datos móviles (no desde el wifi del local).
2. Cocina recibe el pedido en tiempo real y suena.
3. Aceptar, rechazar y entregar; el cliente ve los cambios.
4. Activar **Avisos del pedido** en el teléfono del cliente y confirmar que llega el push.
5. Solo después configura Mercado Pago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`) y prueba en sandbox. Tras editar `.env`: `docker compose up -d`.

## 6. Respaldo fuera del servidor

La app ya guarda respaldos cada seis horas, pero dentro del mismo disco. Si se pierde la VM, se pierden también. `scripts/respaldo-externo.sh` copia el más reciente a `respaldos-externos/` y, con rclone, a otro servicio (Google Drive, OneDrive, Dropbox, otro bucket).

1. Instala rclone en la VM: `sudo apt install -y rclone`.
2. Configura el destino con `rclone config` → `n` (nuevo) → nombre `drive` → tipo `drive` (Google Drive). Deja client id/secret vacíos y alcance `drive.file`. Cuando pregunte por navegador automático responde `n`: te da un comando `rclone authorize "drive" ...` que ejecutas en tu computadora con rclone instalado; inicia sesión y pega en la VM el código resultante.
3. Prueba:

```bash
RCLONE_DESTINO=drive:LosSantos/respaldos sh scripts/respaldo-externo.sh
```

4. Prográmalo cada seis horas con `crontab -e` y añade (cambia la ruta por la tuya):

```cron
20 */6 * * * cd /home/ubuntu/lossantos && RCLONE_DESTINO=drive:LosSantos/respaldos sh scripts/respaldo-externo.sh >> respaldos-externos/registro.log 2>&1
```

Se conservan 14 días en el servidor y 60 en el destino (variables `DIAS_LOCALES` y `DIAS_REMOTOS`). Los respaldos contienen datos de clientes y hashes de contraseñas: el destino debe ser una cuenta privada del negocio. Revisa de vez en cuando que aparezcan archivos nuevos, y practica una restauración (`node scripts/restore-backup.js`, ver README) al menos una vez.

## Actualizar de forma segura

```bash
cd ~/lossantos
sh scripts/respaldo-externo.sh        # copia previa
git pull
docker compose up -d --build
```

La migración genera otro respaldo antes de modificar la base. **Nunca** uses `docker compose down -v`: borra los volúmenes `pedidos_data` (pedidos y respaldos) y `caddy_data` (certificados). Ejecuta una sola instancia por base.

## Sin Docker

Desde un host Node.js 24 con `.env` configurado ejecuta `npm ci`, `npm run build` y `npm start`. Coloca un proxy HTTPS delante del puerto configurado y conserva la cabecera Host original; las mutaciones privadas verifican Origin. Usa un gestor de procesos para reiniciar la app al arrancar el sistema. En producción las cookies Secure requieren HTTPS: para revisar en localhost usa `npm run demo`.

## Red para push y pagos

Permite HTTPS saliente al registro de paquetes durante instalación, `api.mercadopago.com` para pagos y los proveedores que aparezcan en las suscripciones: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`. El servidor rechaza endpoints arbitrarios para evitar usarlo como proxy hacia otras redes.

Para push real prueba al menos: permiso aceptado/rechazado, Android, iPhone instalado en Inicio, app cerrada, conexión temporalmente interrumpida y suscripción expirada. La cola conserva hasta tres intentos y no bloquea cambios de pedido. No se garantizan entrega inmediata ni soporte uniforme de todos los navegadores.
