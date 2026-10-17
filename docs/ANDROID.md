# App Android de Cocina

`android-app/` envuelve el sitio HTTPS del negocio en una app Android (Capacitor 8). Abre directamente `/personal`, y Cocina usa un plugin nativo para que el aviso de pedido nuevo suene fuerte:

- Suena por el **canal de alarma** de Android, no por el multimedia. Sube ese canal al máximo mientras suena y restaura el volumen anterior al silenciar.
- Repite el sonido y vibra hasta que alguien pulsa **Silenciar alarma**, o hasta que no quedan pedidos pendientes.
- Mientras el sonido está activado, la pantalla no se apaga.

En el navegador, Cocina sigue usando el pitido web, ahora repetido cada 3 segundos hasta silenciarlo.

## Límites (léelos antes de depender de ella)

- **La alarma solo está garantizada con la app abierta y en primer plano.** No hay notificaciones push nativas (Firebase). Si la app se cierra, se minimiza o el sistema la suspende, no sonará. Úsala en una tablet o teléfono dedicado, conectado a la corriente, con la app siempre abierta.
- El modo **No molestar** puede silenciar alarmas según su configuración; permite "Alarmas" en sus excepciones.
- La app no funciona sin conexión ni sin el servidor público HTTPS (ver [despliegue](DEPLOYMENT.md)).
- **No se ha probado en un dispositivo real.** El código Java se compiló contra Android 16 y Capacitor 8.5.3, y la lógica de la página se probó en navegador con un plugin simulado. El APK no se compiló en esta sesión porque el entorno no tiene acceso al SDK de Android: se compila con el workflow de GitHub Actions.

## Generar el APK (gratis, con GitHub Actions)

1. Sube el repositorio a GitHub (ya está en `apexdevbrand-wq/PEDIDOS`).
2. **Recomendado, una sola vez: crea una llave de firma.** Sin ella, cada APK se firma con una llave temporal distinta y Android no deja instalar una versión nueva encima: habría que desinstalar la anterior. En una computadora con Java:

```bash
keytool -genkeypair -v -keystore cocina.jks -alias cocina -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 cocina.jks > cocina.jks.txt     # macOS: base64 -i cocina.jks -o cocina.jks.txt
```

   En GitHub → **Settings → Secrets and variables → Actions → New repository secret**, crea:

| Secreto                     | Valor                                        |
| --------------------------- | -------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | contenido de `cocina.jks.txt`                |
| `ANDROID_KEYSTORE_PASSWORD` | contraseña del almacén que elegiste          |
| `ANDROID_KEY_ALIAS`         | `cocina`                                     |
| `ANDROID_KEY_PASSWORD`      | contraseña de la llave (suele ser la misma)  |

   Guarda `cocina.jks` y sus contraseñas en un lugar seguro: si los pierdes, no podrás publicar actualizaciones de esa app.

3. **Actions → APK Android de Cocina → Run workflow**. Escribe la dirección pública, por ejemplo `https://pedidos.tudominio.com`, y pulsa **Run workflow**.
4. Al terminar (unos 5–10 minutos), abre la ejecución y descarga `los-santos-cocina-N` en **Artifacts**. Es un ZIP con el APK dentro.

## Instalar en la tablet de cocina

1. Copia el APK al dispositivo y ábrelo. Android pedirá permitir "instalar apps desconocidas" para el explorador de archivos o el navegador; acéptalo solo para esta instalación.
2. Abre **Los Santos Cocina**, inicia sesión con una cuenta de cocina y pulsa **Activar sonido**. Debe sonar un instante.
3. Haz un pedido de prueba desde otro teléfono: debe sonar fuerte y vibrar hasta pulsar **Silenciar alarma** o aceptar el pedido.
4. Ajustes recomendados del dispositivo: conectado a la corriente; en **Batería**, "Sin restricciones" para la app; excepción de alarmas en No molestar.

## Compilar en tu computadora (opcional)

Con Node.js 24, JDK 21 y Android Studio:

```bash
cd android-app
npm ci
node scripts/set-url.mjs https://pedidos.tudominio.com
npx cap sync android
npx cap open android      # compila y ejecuta desde Android Studio
```

## Archivos

- `android-app/capacitor.config.json`: identificador `mx.lossantos.cocina` y dirección del sitio (la fija `scripts/set-url.mjs`).
- `android-app/android/app/src/main/java/mx/lossantos/cocina/KitchenAlarmPlugin.java`: plugin `KitchenAlarm` (`start`, `stop`, `keepAwake`, `status`).
- `android-app/android/app/src/main/res/raw/alarma.wav`: tono de alarma, generado con `scripts/alarm-wav.mjs`.
- `src/hooks/useKitchenSound.js`: detecta si corre dentro de la app y usa el plugin; si no, Web Audio.
- `.github/workflows/android-apk.yml`: compilación en GitHub Actions.
