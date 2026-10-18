# Corp LiteX · Control de asistencia (PeopleDesk)

> **v4.1.1** (optimización) · **v4.1.0** · roles configurables, bitácora de auditoría, horarios y turnos editables, hora de El Salvador sincronizada con el servidor, consentimiento biométrico, planilla estimada (vista previa), copia de seguridad y estado del sistema. Ver la sección *Novedades v4.1*.

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
  v8.css              Roles, horarios, planilla, auditoría, consentimiento y respaldo
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
  shift-core.js       Matemática pura de turnos (puntualidad, modo entrada/salida, jornada diurna/nocturna)
  clock.js            Hora de El Salvador corregida con la hora del servidor
  schedule.js         Turnos, horarios y asuetos (pantalla Horarios) y parámetros del sistema
  payroll.js          Motor de planilla estimada (funciones puras, sin pantalla)
  payroll-ui.js       Vista previa tipo Excel y descarga de la planilla
  audit.js            Bitácora de auditoría
  roles.js            Roles y accesos configurables
  consent.js          Consentimiento de biometría
  backup.js           Copia de seguridad, restauración, parámetros y estado del sistema
  alerts.js           Alertas del panel
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

## Novedades v4.1

**Actualización obligatoria de reglas.** Publica el nuevo `firestore.rules` (con tu correo en `isSuper`) *a la vez* que subes los archivos. Las terminales con la versión anterior en caché deben recargarse: las reglas nuevas exigen el campo `ts` en cada marca.

### Roles y accesos (Administración → Accesos y roles)
- `admin` (todo), `rrhh` (empleados, permisos, manual, horarios y planilla) y `consulta` (solo lectura). Se asignan por correo de Google, sin tocar código.
- Los correos de `isSuper` en `firestore.rules` siempre son administradores y no pueden quedar bloqueados.
- Las reglas de Firestore son las que imponen los permisos; la interfaz solo oculta lo que no corresponde.

### Bitácora de auditoría
Registra inicios de sesión, altas y cambios de empleados, permisos, registros manuales, horarios, parámetros, consentimientos, biometría, roles, copias y restauraciones. Los registros no se pueden editar ni borrar (lo imponen las reglas). Se filtra y se exporta a Excel.

### Horarios y turnos (menú Horarios)
- Cada turno define hora límite de entrada, hora de salida, horas por día, margen final, tolerancia, umbral de «llegada temprano» y días laborables. Soporta turnos que cruzan la medianoche.
- Se asigna por empleado (Empleados → Editar). Sin turno, se usa el predeterminado, que replica el comportamiento anterior (1:00 p. m. y 5:45 p. m.).
- Muestra si la jornada es diurna, mixta o nocturna y avisa si supera la jornada ordinaria legal.
- También se editan los asuetos.

### Hora de El Salvador y QR fijos
- La hora siempre es la de `America/El_Salvador`, corregida con la cabecera `Date` del servidor del sitio (se vuelve a sincronizar cada 10 minutos). Cada marca guarda `ts`, y las reglas rechazan marcas cuyo `ts` difiera más de 10 minutos de la hora real del servidor.
- **Los QR no cambian nunca**: el `qrToken` no se regenera ni se edita en ninguna pantalla, y las reglas impiden modificarlo, borrar empleados o borrar documentos de `qrTokens`. Al restaurar una copia se conserva el token vigente.

### Consentimiento de biometría
No se puede registrar rostro ni huella sin una pantalla de consentimiento aceptada (casilla + nombre completo del empleado). Se guarda en `consents/{empleado}` con versión y fecha. En Empleados → Editar se puede revocar: borra los datos biométricos. Administración → Privacidad permite desactivar la biometría por completo y fijar el plazo de conservación. El texto es una base: que lo revise un abogado.

### Planilla estimada (menú Planilla, temporal)
Vista previa con aspecto de hoja de Excel (resumen mensual, detalle diario y reglas aplicadas) y descarga con esas mismas hojas. Calcula entrada y salida contra el turno de cada empleado, tardía / temprano / margen final, horas ordinarias, diurnas, nocturnas, extra diurnas y extra nocturnas, descansos y asuetos trabajados, vacaciones tomadas y trabajadas (permiso de tipo *Vacaciones*), y el descuento por tiempo no trabajado. Reglas por defecto: jornada diurna 8 h, mixta 7,5 h, nocturna 7 h; extra con 100 % de recargo (+25 % de nocturnidad, editable); descanso trabajado 50 %; asueto 100 %; falta injustificada = un día. No incluye ISSS, AFP ni renta. Es una estimación orientativa: confírmala con tu contador.

### Copia de seguridad (Administración)
Descarga un `.json` con empleados, tokens QR, asistencia, permisos, horarios y consentimientos (opcional: biometría, bitácora, roles). Restaurar agrega y actualiza, nunca borra. El panel avisa si pasan más de 7 días sin copia. El archivo contiene datos personales: guárdalo cifrado o en un lugar seguro.

### Otros cambios
- Alertas en el Panel: salidas sin entrada, registros manuales, biometría sin consentimiento, copia antigua.
- Estado del sistema: conexión, latencia a Firestore, hora del servidor y rol.
- Corregido: el mensaje de resultado del lector no se mostraba (el parámetro `state` tapaba al estado compartido).
- Nuevos campos de empleado: `shiftId` y `salary`. Nueva colección `staff`, `auditLog`, `consents` y documentos `settings/schedule`, `settings/config`, `settings/backup`.

### Optimización (v4.1.1)
- La librería de Excel (cerca de 1 MB) ya no se descarga al abrir la terminal: se carga solo al exportar (`js/lib.js`). Los demás scripts externos usan `defer` y hay `preconnect` a los servidores de Firebase y cdnjs.
- El reloj crea sus formateadores de fecha una sola vez y solo toca la pantalla cuando el texto cambia.
- Al navegar entre Panel, Asistencia y Permisos no se vuelve a leer Firestore si los datos tienen menos de 15 s (menos lecturas facturadas). Los registros nuevos siguen recargando siempre.
- Los horarios se revisan cada 10 min, pero la interfaz solo se vuelve a pintar si cambiaron.


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
| `permissions` | Permisos personales | Personal autorizado |
| `settings/schedule` | Turnos y asuetos | `get` público, escribe RR. HH. |
| `settings/config`, `settings/backup` | Parámetros y metadatos de respaldo | Lectura personal, escribe admin |
| `staff/{correo}` | Rol y estado de cada acceso | Admin |
| `auditLog` | Bitácora (solo crear) | Lee admin |
| `consents/{empleado}` | Consentimiento biométrico | Personal autorizado |

## Seguridad: lo que conviene saber

- Con el acceso por Google, **cualquier cuenta de Google puede autenticarse** en el proyecto; lo que decide quién administra son las reglas (`isAdmin()` solo acepta los correos de la lista). Si entra una cuenta no autorizada, la app la desconecta y lo avisa. Nunca uses reglas del tipo `request.auth != null`.
- La `apiKey` de Firebase es pública por diseño. La protección real son las reglas. Además puedes restringirla por dominio en Google Cloud Console → *APIs y servicios → Credenciales*.
- La terminal pública solo puede **leer un documento si conoce su token** (UUID aleatorio) y **crear** asistencias que cumplan `validScan`. No puede listar empleados ni asistencias.
- Quien tenga una tarjeta QR puede marcar con ella. Los `qrToken` son fijos a propósito: las reglas no permiten cambiarlos. Si se pierde una tarjeta, desactiva al empleado o ajusta el token manualmente desde la consola de Firebase con una regla temporal.
- La hora se corrige con el servidor y las reglas rechazan marcas con más de 10 minutos de diferencia; `createdAt` sigue siendo la referencia estricta.
- La biometría con WebAuthn confirma que alguien con biometría registrada en *ese dispositivo* la usó; no identifica a una persona concreta en un equipo compartido.

## Formato del código

El JavaScript y el CSS conservan el estilo compacto original. Puedes formatearlos con Prettier:

```bash
npx prettier --write "js/**/*.js" "css/**/*.css" index.html
```
