# Corp LiteX · Control de asistencia (PeopleDesk)

Aplicación web estática (HTML + CSS + JavaScript con módulos ES) con Firebase Auth y Firestore.

- **Terminal pública** (página principal): lector QR con reloj. No requiere sesión.
- **Panel administrativo** (botón *Iniciar sesión*): menú lateral con resumen del día, asistencia (QR / Manual / Biométrica / Facial), empleados, tarjetas QR, permisos, organigrama y exportación a Excel.

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
  panel.css           Panel administrativo: menú lateral, barra superior y resumen
js/
  main.js             Arranque, sesión y pestañas
  layout.js           Títulos por sección y menú lateral en móvil
  dashboard.js        Resumen del día (indicadores, anillo de asistencia, departamentos)
  firebase.js         Configuración e inicialización de Firebase
  state.js            Estado compartido y utilidades ($, TZ)
  time.js             Reloj, fechas y reglas de puntualidad
  employees.js        Alta y directorio de empleados, sincronización de qrTokens
  cards.js            Tarjetas identificativas con QR
  attendance.js       Registro común (QR/manual/biométrico) y tabla del día
  scanner.js          Lector QR con cámara
  manual.js           Registro manual
  biometric.js        Registro biométrico con el sensor del dispositivo (WebAuthn)
  face.js             Reconocimiento facial con la cámara (face-api, solo admin)
  methods.js          Selector QR / Manual / Biométrica / Facial
  permissions.js      Permisos personales
  export.js           Exportación a Excel (.xlsx) con SheetJS
  sound.js            Reproduce tus audios de /sounds (o tonos suaves si faltan) y el aviso de salida
  theme.js            Tema claro/oscuro
  dev-console.js      Consola de registros (solo visible para el administrador)
```

## Puesta en marcha

1. **Firebase**: crea un proyecto, activa *Authentication → Sign-in method → Google* (te pedirá un correo de asistencia del proyecto) y *Firestore Database*.
2. Anota el **correo de Google** de quien administrará (en minúsculas). Ya no hace falta crear usuarios ni copiar UIDs.
3. Pega tu configuración web en `js/firebase.js`.
4. En `firestore.rules` reemplaza `REEMPLAZA_CON_TU_CORREO_DE_GOOGLE@gmail.com` por ese correo (puedes poner varios separados por coma) y publica el archivo en *Firestore → Reglas*.
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

## Panel de control

Al iniciar sesión se abre el **Panel** con el resumen del día, calculado con los datos ya cargados (no hace consultas extra):

- Indicadores: empleados activos, presentes, llegadas tarde, con permiso y sin registro.
- Anillo de asistencia: presentes entre los esperados (descuenta a quien tiene permiso aprobado y no vino).
- Asistencia por departamento, últimos registros y quién falta por registrarse.

En pantallas pequeñas el menú lateral se abre con el botón ☰. La terminal pública no cambia: solo se ve el reloj y el lector QR.

## Reconocimiento facial

Método **Facial** (solo administrador, pestaña Asistencia):

1. **Registrar rostros**: elige al empleado → *Registrar rostro*. Se toman 5 capturas, se promedian y se guarda un descriptor de 128 números en `employees/{id}.faceDescriptor`. **No se guarda ninguna foto.** Si ese rostro ya pertenece a otro empleado, no lo guarda.
2. **Reconocer**: *Iniciar reconocimiento* y el empleado mira a la cámara. Para registrar debe ser reconocido 3 lecturas seguidas, con una coincidencia clara (no ambigua con otra persona). Después de registrar, ignora a esa persona durante 8 s.
3. En los reportes y la tabla el método aparece como **Facial**, y cada registro guarda `faceDistance` (qué tan seguro fue el reconocimiento) para auditoría.

Detalles técnicos y límites:

- Usa `@vladmandic/face-api@1.7.15` (TensorFlow.js) desde jsDelivr. Se descarga **solo** al abrir el método Facial (unos 6,5 MB de modelos la primera vez). Para alojarlo tú mismo, cambia `FACE_API_URL` y `MODEL_URL` al inicio de `js/face.js`.
- **Funciona con la sesión de administrador abierta**, porque los descriptores faciales viven en `employees`, que solo lee el administrador. No se expusieron a la terminal pública a propósito.
- **No tiene detección de "vida"**: una foto de alguien frente a la cámara podría engañarlo. Úsalo con supervisión o combínalo con otro control.
- La exactitud depende de la luz y de la cámara. Los umbrales (`MATCH_THRESHOLD`, `MIN_MARGIN`, `STREAK_NEEDED`) están al inicio de `js/face.js`.
- Los datos faciales son **datos biométricos sensibles**: obtén el consentimiento por escrito del empleado y revisa la normativa de protección de datos que aplique.

## Sonidos

- **Tus propios audios**: súbelos a la carpeta `sounds/` con los nombres indicados en `sounds/README.md`. Si no hay archivo, suenan los tonos de abajo.
- **Lectura correcta**: campanita ascendente (do–mi–sol). **Ya registrado** y **QR no válido** tienen tonos propios y discretos, para que un registro fallido nunca suene a éxito.
- **Hora de salida (5:45 p. m.)**: tres campanadas suaves, repetidas a los 6 y 12 segundos, una sola vez al día.
- El botón **Sonido** lo silencia o activa; **solo aparece con la sesión de administrador** y la preferencia se recuerda en ese navegador (si lo silencias, la terminal pública queda en silencio en ese equipo).
- Los navegadores bloquean el audio hasta que alguien toca la página; en una terminal basta con iniciar la cámara una vez.

## Exportar a Excel

Solo el administrador ve los botones:

- **Asistencia** → tarjeta *Exportar asistencia a Excel*: eliges desde/hasta (máx. 1 año) y baja un `.xlsx` con tres hojas: *Asistencia* (entrada y salida por día, con permiso si lo hay), *Resumen* por empleado y *Detalle* de cada marca.
- **Permisos** y **Empleados**: botón *Exportar a Excel* en cada pestaña. La exportación de empleados no incluye el token QR.

## Modelo de datos (Firestore)

| Colección | Contenido | Acceso |
|---|---|---|
| `employees` | Datos del empleado, `qrToken`, `biometricId`, `faceDescriptor` | Solo admin |
| `qrTokens/{token}` | Copia mínima (nombre, código, puesto, estado) | `get` público, el resto admin |
| `attendance/{empleado_fecha[_salida]}` | Entradas/salidas con `method` (`qr`, `manual`, `biometrico`) | Crear: QR válido o admin; listar: admin |
| `permissions` | Permisos personales | Solo admin |

## Seguridad: lo que conviene saber

- Con el acceso por Google, **cualquier cuenta de Google puede autenticarse** en el proyecto; lo que decide quién administra son las reglas (`isAdmin()` solo acepta los correos de la lista). Si entra una cuenta no autorizada, la app la desconecta y lo avisa. Nunca uses reglas del tipo `request.auth != null`.
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
