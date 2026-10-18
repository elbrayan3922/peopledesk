# Sonidos de la terminal

Sube aquí tus archivos de audio. La página los busca por **nombre** (no hace falta tocar el código):

| Archivo | Cuándo suena |
|---|---|
| `success.mp3` | Lectura correcta del QR (asistencia registrada) |
| `exit-alarm.mp3` | Aviso de hora de salida (5:45 p. m.) |
| `duplicate.mp3` | *(opcional)* El empleado ya estaba registrado |
| `error.mp3` | *(opcional)* QR no válido o error |

- Formatos admitidos: `.mp3` (recomendado), `.wav` u `.ogg`.
- Si falta un archivo, ese sonido usa un tono suave generado por el navegador, así que puedes subir solo los que quieras.
- Conviene que duren **1 a 3 segundos** y pesen poco (menos de 200 KB).
- Volumen y repeticiones: se ajustan al inicio de `js/sound.js` (`VOLUME` y `EXIT_FILE_REPEATS`).
- Usa audios libres de derechos o que tengas permiso de usar.
