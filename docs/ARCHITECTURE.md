# Arquitectura y contratos

## Tres módulos y capas

- `src/views/Shop.jsx`: catálogo, variantes de carrito y configuración de productos; `Cart.jsx` crea compras con clave persistente; `Tracking.jsx` muestra seguimiento, rechazo, estimación, push y comprobante.
- `src/views/Kitchen.jsx`: flujo cronológico, sonido, tiempos, rechazo, WhatsApp manual y tickets. `useKitchenSound.js` repite el aviso hasta silenciarlo; dentro de la app Android usa el plugin nativo `KitchenAlarm` (canal de alarma), y en el navegador un único contexto de audio por activación que cierra al salir.
- `src/views/Admin.jsx`: secciones internas de caja, menú/colonias, negocio/insumos, equipo/auditoría y respaldos. No son módulos públicos adicionales.
- `server/domain.js`: cálculo en centavos y transiciones; la UI comparte esa función pura para actualizar el carrito, pero el servidor recalcula independientemente.
- `server/operations.js`: disponibilidad efectiva, horarios nocturnos, configuración, opciones, fingerprint de compra y reportes.
- `server/auth.js`: bootstrap, scrypt, cuentas, sesiones, roles, limitación de intentos y revocación por versión de usuario.
- `server/management.js`: operación, reportes, cierres y respaldos; `messages.js` prepara texto y HTML escapado.
- `server/push.js`: VAPID persistido, validación de endpoints y cola durable con hasta tres intentos; el envío se ejecuta fuera de la mutación del pedido.
- `server/store.js` / `schema.sql`: SQLite WAL, migraciones, transacciones, respaldo nativo consistente.
- `scripts/`: inicio portable, configuración local, recuperación del dueño y restauración. `lock.js` impide dos instancias sobre la misma base.

Un mismo origen sirve frontend y API. El catálogo público `/` no incluye botón ni enlace de personal y permanece público aunque ese navegador tenga una sesión de equipo. `/personal` sirve el formulario independiente y recupera la sesión de cocina/dueño; conocer su URL no sustituye autenticación. SSE difunde solo una señal, sin datos privados; cada cliente vuelve a consultar las rutas autorizadas. El catálogo y estado de recepción también se refrescan cada minuto para reflejar horarios/pausas que expiran.

## Datos persistentes

| Tabla              | Contenido                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| products           | Precio base, imagen, categoría y activación; JSON de opciones y relaciones de insumos                                      |
| zones              | Nombre, costo y activación                                                                                                 |
| orders             | UUID de seguimiento, folio, cliente, entrega, importes y estados; clave única de compra y JSON de estimación/rechazo/pagos |
| order_items        | Nombre/precio/cantidad/notas históricos y JSON de opciones seleccionadas                                                   |
| app_meta           | Operación, insumos, cortes y claves VAPID internas (no se devuelven al cliente)                                            |
| users              | Usuario único, nombre, rol, hash scrypt, sal, activación y versión de sesión                                               |
| audit_log          | Fecha, actor, acción, objetivo y detalles sin contraseñas                                                                  |
| push_subscriptions | Endpoint cifrable y claves públicas del dispositivo por pedido                                                             |
| push_jobs          | Avisos pendientes, intentos y estado de entrega al proveedor                                                               |

La clave de compra tiene índice UNIQUE. Su fingerprint normaliza campos de intención, sin confiar en totales enviados. Un reintento con la misma clave devuelve el pedido existente aunque hayan cambiado precios, horarios o disponibilidad; cambiar su contenido genera 409. Una exclusión en memoria evita crear preferencias de pago concurrentes para esa compra en la única instancia. Una compra nueva requiere clave nueva.

Las líneas capturan precios y nombres de opciones al crear el pedido. Cambiar menú o insumos no altera pedidos previos. `zone_id` mantiene la relación si se renombra una colonia, mientras `zone_name` conserva la entrega original. Disponibilidad es booleana, sin inventario cuantitativo.

## Estados y finanzas

`pending → cooking → ready → completed`, con rechazo desde pending o cooking. Aceptar establece hora estimada; rechazar exige motivo y registra si hace falta reembolso. `ready` significa En camino para domicilio y Listo para recoger para pickup. Efectivo se marca cobrado al confirmar entrega. MP se confirma exclusivamente por webhook firmado y consulta al proveedor.

Estado financiero independiente: unpaid, paid, refunded, charged_back. Se conserva la fecha de cobro y eventos incrementales de devolución. Un reembolso posterior no borra el cobro histórico: afecta el neto de su fecha de devolución. Los reportes separan recibido, devoluciones, neto, productos, envío y recargo. El corte guarda una fotografía desde el último cierre con efectivo contado y responsable. No reemplaza contabilidad fiscal ni conciliación bancaria.

## Rutas principales

| Ruta                                                                              | Acceso                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET /api/catalog, /api/events, /api/push/key                                      | Público, sin datos de otros pedidos               |
| POST /api/orders                                                                  | Público, con requestId de compra                  |
| GET /api/orders/:uuid, /api/orders/:uuid/ticket                                   | UUID secreto de seguimiento                       |
| POST/DELETE /api/orders/:uuid/push                                                | UUID de seguimiento y suscripción del dispositivo |
| POST /api/auth/login, /api/auth/logout; GET /api/auth/session                     | Autenticación individual y sesión                 |
| GET /api/staff/orders; PATCH /api/staff/orders/:id                                | Cocina y dueño                                    |
| POST /api/staff/pause                                                             | Cocina y dueño, solo pausa de 0–120 minutos       |
| GET /api/staff/orders/:id/whatsapp, /ticket                                       | Cocina y dueño                                    |
| PATCH /api/staff/products/:id; PUT /api/staff/products/:id/options                | Dueño                                             |
| POST/PATCH /api/staff/zones[/:id]                                                 | Dueño                                             |
| PATCH /api/staff/settings; GET/POST/PATCH /api/staff/ingredients[/:id]            | Dueño                                             |
| GET/POST/PATCH /api/staff/users[/:id]; GET /api/staff/audit                       | Dueño                                             |
| GET /api/staff/reports?date=YYYY-MM-DD[&format=csv]; GET/POST /api/staff/closures | Dueño                                             |
| GET/POST /api/staff/backups; GET /api/staff/backups/:filename                     | Dueño                                             |

No sesión → 401; rol sin permiso → 403. Mutaciones privadas verifican Origin. Las cookies son HttpOnly, SameSite Strict y Secure en producción. Desactivar/cambiar una cuenta incrementa su versión y revoca sesiones. Los hashes y la clave privada VAPID nunca aparecen en la API; los respaldos descargables por el dueño sí contienen la base completa y deben protegerse.

## Pruebas y límites

Las pruebas usan servidores y bases temporales, puertos libres y diagnóstico de arranque con espera de 30 segundos. Cubren la API real, reintentos tras reinicio, roles, usuarios, caja, backups/restauración, importes, horarios y el service worker de push. El navegador verifica compra personalizada, recepción/cocina, impresión, rechazo visible, WhatsApp sin enviar, insumos, pausa, cuentas, cierre y responsividad.

Persistencia pensada para una instancia y volumen bajo: el estado operativo se carga en memoria y cada mutación se persiste transaccionalmente. Para múltiples instancias o un historial grande habrá que migrar a consultas/paginación por entidad y eventos compartidos. Las sesiones no sobreviven al reinicio. Requieren validación externa: cobro/reembolso MP con credenciales, entrega push en teléfonos reales, impresión física y DNS/HTTPS del despliegue.

## App Android

`android-app/` es un proyecto Capacitor independiente del servidor: carga `PUBLIC_URL/personal` en un WebView y registra el plugin `KitchenAlarm`. No incluye código del frontend; cada cambio web se refleja al recargar la app. Detalles en [ANDROID.md](ANDROID.md).
