# Los Santos · Pedidos, cocina y administración

Aplicación de pedidos de **Los Santos · Drinks, snacks & más** (Minatitlán, Ver.) con tres módulos: cliente, cocina y administración. React, Tailwind, Express y SQLite de Node.js 24. Español, precios MXN y zona horaria configurable.

## Publicar gratis en Cloudflare (versión 0.6)

La rama `cloudflare` corre completa en el plan gratis de Cloudflare, sin servidor propio: interfaz estática, API y base SQLite en un Durable Object, tiempo real por WebSocket y avisos push. Mismo código y mismas pruebas que la versión Node (`npm test` y `npm run test:cloudflare`). Pasos en [CLOUDFLARE.md](CLOUDFLARE.md).

## Novedades de la versión 0.5 (lanzamiento web)

- **Carta completa** de “¿Qué se te antoja hoy?”: 46 productos activos en Combos, Hamburguesas (pecados capitales), Alitas y boneless (10/15/20 piezas, 300 g/500 g/1 kg y 8 salsas), Diablitros (miches), Drinks, La Elotiza (esquites, elotes con sabrita, charolas) y Mariscos (aguachile con promoción de 2 micheladas por $150). Dos combos que en la carta aparecen atenuados quedan **archivados**: se reactivan en Catálogo → Archivados.
- **Rediseño estilo carta impresa**: fondo papel, tableros rojos con listón amarillo, título “¿Qué se te antoja hoy?”, sección “Los consentidos” y menú en lista para pedir rápido desde el teléfono.
- **Ángel y diablito redibujados en vector** con poses (saluda, guiña, antojo, duerme, fiesta) y movimiento leve: aparecen en la portada, en las secciones, en el carrito, en el seguimiento, en la alarma de Cocina y cuando los pedidos están en pausa.
- **Pago por transferencia**: el dueño captura banco, titular y CLABE en Administración → Negocio; el cliente ve los datos con botones para copiar y un botón que abre WhatsApp (921 489 9319 por defecto) con el folio y el monto. Cocina pulsa “Transferencia recibida” antes de preparar. Aparece en caja, CSV y ticket.
- **Mercado Pago** se muestra como “Muy pronto” y queda desactivado hasta configurar sus credenciales.
- Frase editable por categoría (el listón amarillo) y `scripts/oracle-cloud-init.yaml` para crear el servidor de Oracle ya instalado.

## Novedades de la versión 0.4 (versión unificada)

Reúne lo mejor de tres líneas de trabajo: la v0.3 (catálogo administrable, rediseño, Mercado Pago probado, respaldos a R2/B2, rendimiento), la **v2** que compartiste (fotos recortadas reales, logotipo y personajes en alta calidad, alarma de cocina con sonido) y la rama `entrega-los-santos` de **GitHub** (app Android de Cocina con alarma nativa, compilación en GitHub Actions, guía de Google Cloud y respaldo con rclone).

- **Tiempo de entrega por colonia**: en Administración → Envíos cada colonia tiene costo y minutos de traslado. El cliente los ve al elegir colonia; al aceptar su pedido ve la **hora aproximada de llegada** (salida estimada + traslado) y, cuando Cocina pulsa “Salió a entregar”, la hora se recalcula desde ese momento. También aparece en Cocina, WhatsApp, avisos push y ticket. Cada pedido conserva los minutos vigentes al comprar.
- **Fotos reales**: recortes PNG sin fondo de hamburguesas, tostilocos, elotes, esquites, mojito y café sobre el rojo de la marca; logotipo y ángel/diablito en alta resolución; la portada combina esos recortes. Las fotos PNG sin fondo que subas desde el panel conservan la transparencia.
- **Menú inicial unificado** (17 productos en 6 categorías) y migración automática: si tu base todavía tiene el menú de demostración, se reemplaza por el de Los Santos sin tocar pedidos.
- **Alarma de cocina**: sonido en bucle hasta aceptar o silenciar, recordatorio a los 90 s, pantalla encendida y aviso rojo con el número de pedidos nuevos. En la app Android suena por el canal de alarma a volumen máximo.
- **App Android de Cocina** (`android-app/`) y su compilación gratuita en GitHub Actions con firma estable ([docs/ANDROID.md](docs/ANDROID.md)).
- Respaldos fuera del servidor: R2/B2 desde la app o Google Drive con `scripts/respaldo-externo.sh` (ahora incluye fotos).

## Novedades de la versión 0.3

- **Catálogo sin tocar código** (Administración → Catálogo): crear, editar, archivar y devolver productos; crear, renombrar, ordenar, ocultar y eliminar categorías vacías; subir fotos desde el teléfono o la computadora (se reducen solas antes de subir); marcar favoritos; buscar. Archivar no altera pedidos anteriores.
- **Rediseño con la identidad real**: logotipo, rojo y amarillo de la marca, tipografía condensada como en sus carteles, sello amarillo de precio, ángel y diablito, fotos tomadas de su publicidad. Menú por secciones con navegación fija, tarjetas horizontales y hoja de pedido inferior en teléfonos.
- **Cocina como tablero** (Nuevos / En cocina / Listos), con reloj por pedido, alerta de tiempo vencido y protección cuando dos tabletas pulsan a la vez.
- **Seguimiento del pedido** con barra de avance para el cliente.
- **Mercado Pago**: probado de punta a punta contra un simulador de la API; botón “Consultar pago ahora” si el webhook no llega; la preferencia vence en 30 min.
- **Respaldos fuera del servidor** automáticos a Cloudflare R2 o Backblaze B2 (S3 compatible, firma verificada con el vector oficial de AWS), incluidas las fotos.
- **Publicación a costo cero**: guía para Oracle Cloud Always Free + DuckDNS + Caddy, o Cloudflare Tunnel; script `scripts/oracle-setup.sh`; `/api/health` para monitoreo.
- **Rendimiento**: solo se guardan los pedidos que cambian (con 3,300 pedidos, crear uno pasó de 49 ms a 14 ms) y Cocina recibe solo pedidos abiertos y de las últimas 24 h.
- **Prueba de operación** `npm run stress -- --base … --user … --pass …`: pedidos simultáneos, dobles envíos, carreras en cocina y reconexiones.
- Datos públicos editables (frase, dirección, teléfono, Instagram, TikTok, Facebook).

Pendiente fuera del código, con lista paso a paso en [docs/PRUEBAS-REALES.md](docs/PRUEBAS-REALES.md): cobro real y sandbox de Mercado Pago con tu cuenta, avisos push en teléfonos con HTTPS, impresora térmica, y publicar el servidor ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Descargar y ver demos

- [Proyecto completo ZIP](https://github.com/apexdevbrand-wq/PEDIDOS/raw/refs/heads/entrega-los-santos/entregables/Los-Santos-proyecto.zip).
- [Demos visuales ZIP](https://github.com/apexdevbrand-wq/PEDIDOS/raw/refs/heads/entrega-los-santos/entregables/Los-Santos-demos.zip): descomprime y abre `demos/index.html`.
- [Capturas](entregables/demos/). Son imágenes de la app funcionando, no una aplicación interactiva alojada.

## Instalar en VS Code (Windows, macOS o Linux)

1. Instala **Node.js 24** y abre en VS Code la carpeta que contiene `package.json`.
2. En Terminal → Nueva terminal ejecuta:

```bash
npm ci
npm test
npm run build
```

3. Si es la primera instalación y no tienes `.env`, ejecuta:

```bash
npm run configurar
```

El asistente te pide un usuario y una contraseña del dueño (mínimo 12 caracteres, no se muestra en pantalla). Guarda `.env` localmente y no sobrescribe un archivo existente. No hay contraseñas predeterminadas.

4. Arranca la revisión local:

```bash
npm run demo
```

El catálogo del cliente está en `127.0.0.1:3000`. Para iniciar sesión como personal escribe `127.0.0.1:3000/personal`; esta entrada no aparece como botón ni enlace en el catálogo. Puedes guardarla en tus favoritos. Mantén la terminal abierta. Para detenerla, Ctrl+C. El modo demo usa la interfaz compilada, sin Vite ni vigilancia de archivos; los permisos siguen activos. Si editas código, repite `npm run build` y reinicia. Para desarrollar con recarga usa `npm run dev`.

Todos los comandos de inicio cargan `.env` automáticamente y funcionan en PowerShell. No necesitas escribir `OWNER_TOKEN=...` en la terminal.

### Si ya tenías la versión anterior

1. Detén el servidor. Conserva una copia completa de tu carpeta `data/` y de tu `.env` fuera del proyecto mientras esté detenido.
2. Extrae la actualización en una carpeta nueva. Copia allí tus carpetas `data/`, tu `.env` y cualquier fotografía propia de `public/`.
3. Ejecuta `npm ci`, `npm test`, `npm run build` y `npm run demo`.
4. La base se migra automáticamente y se genera un respaldo antes de modificarla.
5. Si aún no había usuarios individuales, se crea **`dueno`** con tu antigua clave `OWNER_TOKEN`, y **`cocina`** con tu antigua clave `STAFF_TOKEN` si era diferente. También puedes definir `OWNER_USERNAME` / `OWNER_PASSWORD` antes del primer inicio.
6. Abre `/personal`, ahora con **usuario y contraseña**. Crea las cuentas de cada empleado en Administración → Equipo y actividad.

No borres `data/` para actualizar. Las contraseñas de cuentas que ya existen no cambian al editar `.env`: cámbialas en Administración o usa el procedimiento de recuperación.

## Accesos

| Perfil             | Vistas                  | Acciones                                                                     |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| Cliente sin sesión | Ordenar                 | Catálogo, carrito, pedidos y seguimiento por UUID                            |
| Usuario cocina     | Cocina                  | Aceptar, estimar, rechazar, entregar/cobrar, pausar y abrir WhatsApp/tickets |
| Usuario dueño      | Cocina y Administración | Todo lo anterior, menú, horarios, equipo, auditoría, caja y respaldos        |

El catálogo público no muestra accesos de personal. La ruta `/personal` abre el formulario independiente; conocer esa dirección no concede acceso. El servidor valida cada ruta. `401` indica que falta sesión; `403`, permisos insuficientes. Desactivar una cuenta, cambiarle contraseña o modificar sus permisos revoca sus sesiones. No se puede quitar al último dueño activo. Las contraseñas se almacenan con scrypt y sal aleatoria. La sesión dura ocho horas, usa cookie HttpOnly/SameSite Strict y Secure en producción, y se pierde al reiniciar.

Las claves antiguas solo sirven para inicializar cuentas y como compatibilidad técnica Bearer mientras sigan correspondiendo a la cuenta activa y su versión. Después de crear las cuentas, elimina `OWNER_TOKEN` y `STAFF_TOKEN` del entorno si no necesitas esa compatibilidad. Hay límite de intentos de acceso y protección de origen para mutaciones privadas.

## Funciones implementadas

### Ordenar

Catálogo por categoría, precios y fotos locales, carrito con combinaciones distintas de extras/opciones, notas y cantidades. Recogida gratuita o envío por colonia. El servidor calcula centavos MXN y cobra el 4% sobre productos más envío únicamente para Mercado Pago. Se rechazan productos y opciones agotados.

Cada compra lleva una clave persistente por intento: doble clic, reintentos y reinicios no crean otro folio para la misma clave/contenido. Los cambios de precio se validan antes de confirmar. El cliente ve estado, motivo de rechazo, tiempo estimado, pago y comprobante imprimible.

### Cocina

Tarjetas cronológicas con tiempo de espera y aviso visual de estimación vencida. Botón **Activar sonido** (requiere interacción y pestaña abierta). Al aceptar se indica el tiempo estimado; se puede actualizar. Rechazar exige motivo visible al cliente. Hay pausa rápida de 20 minutos, botón de comanda y ticket de 80 mm mediante el diálogo del navegador.

**WhatsApp es manual y no integra una API de pago:** Cocina pulsa WhatsApp, revisa o edita el mensaje, pulsa Abrir WhatsApp y luego pulsa **Enviar dentro de WhatsApp**. La app no envía mensajes sola ni comprueba su entrega. Para teléfonos mexicanos de diez dígitos añade 52; el país es configurable. El dispositivo necesita WhatsApp instalado o WhatsApp Web con sesión.

### Administración

- Catálogo: productos (nombre, categoría, precio, descripción, foto, disponible, favorito, orden), archivar/restaurar, categorías (crear, renombrar, ordenar, ocultar, eliminar vacías), fotos subidas desde el panel. Grupos de tamaño/salsa/extras, mínimos/máximos y precios por opción. Relaciones de insumos por platillo y por extra.
- Envíos: colonias, costo de envío y minutos de traslado (visibles para el cliente).
- Insumos: disponible/agotado. Si falta pollo se bloquean todos los platillos asociados; si no quedan opciones obligatorias, también se bloquea el producto. Es disponibilidad manual, **no inventario por cantidades ni descuento automático de recetas**.
- Horarios: siete días, zona horaria, turnos que cruzan medianoche, cierre manual y pausa con mensaje. Por defecto el horario automático está desactivado hasta que el dueño configure el real.
- Usuarios: cuentas individuales, permisos, activación y cambio de contraseña. Auditoría de acceso, pedidos, precios, insumos, caja y respaldos (últimos 200 eventos visibles).
- Caja: cobros por fecha de pago, efectivo/MP, productos, envío, recargo, devoluciones registradas, neto y reembolsos pendientes; exportación CSV. Los cortes guardan desde el último cierre, efectivo contado, diferencia, notas y responsable. No son facturas fiscales ni conciliación bancaria automática.

## Notificaciones push sin tarifa por mensaje

Web Push con claves VAPID generadas y guardadas en SQLite. El cliente activa **Avisos del pedido** y acepta el permiso del navegador. Las actualizaciones se encolan y se reintentan hasta tres veces; los endpoints expirados se eliminan. Los destinos de push se restringen a proveedores conocidos. No se cachean pedidos ni datos personales en el service worker.

Para clientes reales se necesita un servidor encendido, URL pública **HTTPS**, navegador compatible, conexión y autorización. En iPhone/iPad se requiere una versión compatible y añadir la app a Inicio. En localhost se puede probar el soporte local. Las notificaciones pueden llegar con la app cerrada según el sistema, pero no garantizan entrega inmediata. Configura `VAPID_SUBJECT` con un contacto real del negocio. No se ha confirmado entrega en un teléfono real durante esta implementación; sí se probaron el alta/rechazo de suscripciones y el manejo del aviso/clic del service worker.

No se integró SMS ni WhatsApp automático: tienen condiciones y posibles tarifas externas. Web Push no tiene tarifa por mensaje del protocolo; alojamiento, dominio y datos móviles dependen de tus proveedores.

## Respaldar y recuperar

Respaldos SQLite consistentes al arrancar, antes de actualizar y cada seis horas mientras el proceso esté activo. Se conservan los últimos 56 automáticos y 14 previos a actualización; los manuales se conservan. Desde Administración → Respaldos puedes crearlos y descargarlos. Una copia en el mismo disco no protege de perder la computadora: guarda también una fuera de ella.

Con el servidor detenido:

```bash
node scripts/restore-backup.js "RUTA-DEL-RESPALDO.sqlite"
```

El comando verifica integridad, preserva la base actual y restaura. Rechaza hacerlo si el servidor está activo. Se probó la recuperación de pedidos y la preservación de la base anterior. Los respaldos contienen datos de clientes, hashes de cuentas y claves push: mantenlos privados. Las fotos propias se respaldan por separado.

### Recuperar acceso del dueño

Detén el servidor, configura `OWNER_USERNAME` y una nueva `OWNER_PASSWORD` de al menos 12 caracteres en `.env`, y ejecuta:

```bash
npm run reset-owner
npm run demo
```

La recuperación no borra pedidos. Cualquiera con acceso de escritura a la máquina puede administrar su base, por lo que debes proteger ese acceso.

## Mercado Pago y publicación

Checkout Pro se habilita con `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `PUBLIC_URL` HTTPS. El webhook `/api/payments/webhook` valida firma y consulta ID, referencia, moneda e importe en la API del proveedor. La vuelta del navegador no confirma pagos. Reembolsos/cupones se tramitan manualmente; sus cambios financieros se registran al recibir notificación verificada de MP. No se ejecutaron cobros ni reembolsos reales: faltan credenciales y cuenta sandbox.

`npm start` sirve producción y exige HTTPS para sus cookies. [Publicación con Docker y Caddy](docs/DEPLOYMENT.md) deja preparada la configuración, pero no contrata ni publica alojamiento. La app deja de estar disponible si apagas su servidor. Ejecuta una única instancia por archivo SQLite; hay bloqueo para evitar procesos simultáneos.

## Validación y arquitectura

`npm test` cubre importes, opciones, duplicados persistentes, permisos, sesiones, usuarios, auditoría, horarios, insumos, caja, firma de pagos, push y restauración. La prueba de arranque espera hasta 30 segundos y muestra el error real del proceso si falla. Se comprobó el recorrido de compra/cocina/admin en navegador y las tres vistas móviles sin desbordamiento.

Consulta [arquitectura](docs/ARCHITECTURE.md), [despliegue](docs/DEPLOYMENT.md) y [recursos visuales](docs/ASSETS.md). Sustituye el menú y fotografías ilustrativas por tus recursos reales. La base sigue orientada a un negocio de una sola instancia: antes de operación pública define políticas de datos, monitoreo, límites de pedidos abusivos y operación/conciliación de pagos con el proveedor.
