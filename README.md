# Corp LiteX · Control de asistencia (PeopleDesk)

Aplicación web estática (HTML + CSS + JavaScript con módulos ES) con Firebase Auth y Firestore.

- **Terminal pública** (página principal): lector QR con reloj. No requiere sesión.
- **Panel administrativo** (botón *Iniciar sesión*): empleados, tarjetas QR, asistencia (QR / Manual / Biométrica), permisos, organigrama y exportación a Excel.

## Estructura

```
index.html            Estructura de la página
firestore.rules       Reglas de seguridad de Firestore
sounds/              Tus audios (success.mp3, exit-alarm.mp3, ...)
css/
  base.css            Estilos base
  print.css           Impresión de tarjetas
  theme.css           Tema claro/oscuro y componentes
  dev-console.css     Consola de registros en pantalla
  terminal.css        Reloj y vista del lector
  features.css        Métodos de registro, permisos y acceso
js/
  main.js             Arranque, sesión y pestañas
  firebase.js         Configuración e inicialización de Firebase
  state.js            Estado compartido y utilidades ($, TZ)
  time.js             Reloj, fechas y reglas de puntualidad
  employees.js        Alta y directorio de empleados, sincronización de qrTokens
  cards.js            Tarjetas identificativas con QR
  attendance.js       Registro común (QR/manual/biométrico) y tabla del día
  scanner.js          Lector QR con cámara
  manual.js           Registro manual
  biometric.js        Registro biométrico (WebAuthn)
  methods.js          Selector QR / Manual / Biométrica
  permissions.js      Permisos personales
  export.js           Exportación a Excel (.xlsx) con SheetJS
  sound.js            Reproduce tus audios de /sounds (o tonos suaves si faltan) y el aviso de salida
  theme.js            Tema claro/oscuro
  dev-console.js      Consola de registros (solo visible para el administrador)
```

## Puesta en marcha

1. **Firebase**: crea un proyecto, activa *Authentication → Correo/contraseña* y *Firestore Database*.
2. Crea el usuario administrador en *Authentication* y copia su **UID**.
3. Pega tu configuración web en `js/firebase.js`.
4. En `firestore.rules` reemplaza `REEMPLAZA_CON_TU_UID_DE_ADMIN` por el UID y publica el archivo en *Firestore → Reglas*.
5. **Inicia sesión una vez como administrador** antes de usar la terminal pública: así los empleados ya existentes se copian a la colección `qrTokens` (los nuevos se sincronizan al registrarlos).

## Ejecutar en local

Los módulos ES no funcionan abriendo el archivo con doble clic; usa un servidor:

```bash
python -m http.server 8000      # y abre http://localhost:8000
```

La cámara y la biometría requieren HTTPS (o `localhost`).

## Publicar

- **GitHub Pages**: *Settings → Pages → Deploy from a branch → main / (root)*.
- **Firebase Hosting**: `firebase init hosting` y `firebase deploy`.

Después añade tu dominio a *Authentication → Settings → Authorized domains*.

## Sonidos

- **Tus propios audios**: súbelos a la carpeta `sounds/` con los nombres indicados en `sounds/README.md`. Si no hay archivo, suenan los tonos de abajo.
- **Lectura correcta**: campanita ascendente (do–mi–sol). **Ya registrado** y **QR no válido** tienen tonos propios y discretos, para que un registro fallido nunca suene a éxito.
- **Hora de salida (5:45 p. m.)**: tres campanadas suaves, repetidas a los 6 y 12 segundos, una sola vez al día.
- El botón **Sonido** de la terminal lo silencia o activa (se recuerda en ese navegador).
- Los navegadores bloquean el audio hasta que alguien toca la página; en una terminal basta con iniciar la cámara una vez.

## Exportar a Excel

Solo el administrador ve los botones:

- **Asistencia** → tarjeta *Exportar asistencia a Excel*: eliges desde/hasta (máx. 1 año) y baja un `.xlsx` con tres hojas: *Asistencia* (entrada y salida por día, con permiso si lo hay), *Resumen* por empleado y *Detalle* de cada marca.
- **Permisos** y **Empleados**: botón *Exportar a Excel* en cada pestaña. La exportación de empleados no incluye el token QR.

## Modelo de datos (Firestore)

| Colección | Contenido | Acceso |
|---|---|---|
| `employees` | Datos del empleado, `qrToken`, `biometricId` | Solo admin |
| `qrTokens/{token}` | Copia mínima (nombre, código, puesto, estado) | `get` público, el resto admin |
| `attendance/{empleado_fecha[_salida]}` | Entradas/salidas con `method` (`qr`, `manual`, `biometrico`) | Crear: QR válido o admin; listar: admin |
| `permissions` | Permisos personales | Solo admin |

## Seguridad: lo que conviene saber

- La `apiKey` de Firebase es pública por diseño. La protección real son las reglas. Además puedes restringirla por dominio en Google Cloud Console → *APIs y servicios → Credenciales*.
- La terminal pública solo puede **leer un documento si conoce su token** (UUID aleatorio) y **crear** asistencias que cumplan `validScan`. No puede listar empleados ni asistencias.
- Quien tenga una tarjeta QR puede marcar con ella. Si se pierde una tarjeta, hoy hay que cambiar el `qrToken` del empleado a mano en Firestore (y borrar su documento en `qrTokens`); la app aún no tiene botón para regenerarlo.
- La hora del registro la envía el navegador (`createdAt` sí es la del servidor). Para auditoría estricta, usa `createdAt`.
- La biometría con WebAuthn confirma que alguien con biometría registrada en *ese dispositivo* la usó; no identifica a una persona concreta en un equipo compartido.

## Formato del código

El JavaScript y el CSS conservan el estilo compacto original. Puedes formatearlos con Prettier:

```bash
npx prettier --write "js/**/*.js" "css/**/*.css" index.html
```
