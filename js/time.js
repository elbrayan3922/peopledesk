/* Reloj, fechas (zona horaria de El Salvador) y reglas de puntualidad / modo entrada-salida. */
import {$,TZ} from "./state.js";
import {playExitAlarm} from "./sound.js";

export function getClockParts(){const parts=new Intl.DateTimeFormat("en-US",{timeZone:TZ,hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),r={};parts.forEach(p=>{if(p.type!=="literal")r[p.type]=Number(p.value)});return r}
export function getDateKey(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),r={};parts.forEach(p=>{if(p.type!=="literal")r[p.type]=p.value});return `${r.year}-${r.month}-${r.day}`}
export function getDateLabel(){return new Intl.DateTimeFormat("es-SV",{timeZone:TZ,weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date())}
export function getTimeLabel(p=getClockParts()){return `${p.hour%12||12}:${String(p.minute).padStart(2,"0")}:${String(p.second).padStart(2,"0")} ${p.hour>=12?"p. m.":"a. m."}`}
export function getPunctuality(p=getClockParts()){const m=p.hour*60+p.minute;if(m<775)return{label:"A tiempo",color:"green"};if(m<780)return{label:"Margen final",color:"orange"};return{label:"Tardío",color:"red"}}
// Desde las 5:45 p. m. (17:45) el lector registra SALIDAS. A las 00:00 (hora de El Salvador) vuelve a registrar ENTRADAS.
export const EXIT_START_MIN=17*60+45;
export function getAttendanceMode(p=getClockParts()){return (p.hour*60+p.minute)>=EXIT_START_MIN?"salida":"entrada"}
export function getRecordType(item){return item&&item.type==="salida"?"salida":"entrada"}
export function maskToken(t){return String(t||"").slice(0,6)+"…"}
let lastMode=null;
function updateClock(){const p=getClockParts();$("clock").textContent=getTimeLabel(p);$("dateText").textContent=getDateLabel();const mode=getAttendanceMode(p);
if(mode==="salida"){$("timeStatus").textContent="Registro de salida";$("timeStatus").className="time-status blue";$("deadlineLabel").textContent="Salidas habilitadas desde";$("deadlineValue").textContent="5:45 p. m."}
else{const s=getPunctuality(p);$("timeStatus").textContent=s.label;$("timeStatus").className=`time-status ${s.color}`;$("deadlineLabel").textContent="Hora límite de entrada";$("deadlineValue").textContent="1:00 p. m."}
$("scanMode").textContent=mode==="salida"?"Salida":"Entrada";
if(mode!==lastMode){console.info(`[Modo] Lector en modo ${mode.toUpperCase()}.`);if(lastMode==="entrada"&&mode==="salida")playExitAlarm();lastMode=mode}}
export function startClock(){updateClock();setInterval(updateClock,1000)}
