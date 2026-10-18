/* Reloj, fechas (hora oficial de El Salvador, corregida con la hora del servidor) y reglas de puntualidad / modo entrada-salida.
 * Los horarios ya no están fijos en el código: salen de los turnos configurados en el panel (js/schedule.js). */
import {$,TZ} from "./state.js";
import {playExitAlarm} from "./sound.js";
import {nowDate,clockInfo} from "./clock.js";
import {getDefaultShift} from "./schedule.js";
import {punctualityOf,modeOf,hm,fmtHM} from "./shift-core.js";

/* Los formateadores Intl son caros de crear: se crean una vez, no en cada tick del reloj. */
const F_PARTS=new Intl.DateTimeFormat("en-US",{timeZone:TZ,hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}),F_KEY=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}),F_LABEL=new Intl.DateTimeFormat("es-SV",{timeZone:TZ,weekday:"long",day:"numeric",month:"long",year:"numeric"});
export function getClockParts(){const parts=F_PARTS.formatToParts(nowDate()),r={};parts.forEach(p=>{if(p.type!=="literal")r[p.type]=Number(p.value)});return r}
export function getDateKey(){const parts=F_KEY.formatToParts(nowDate()),r={};parts.forEach(p=>{if(p.type!=="literal")r[p.type]=p.value});return `${r.year}-${r.month}-${r.day}`}
export function getDateLabel(){return F_LABEL.format(nowDate())}
export function getTimeLabel(p=getClockParts()){return `${p.hour%12||12}:${String(p.minute).padStart(2,"0")}:${String(p.second).padStart(2,"0")} ${p.hour>=12?"p. m.":"a. m."}`}
const minutes=p=>p.hour*60+p.minute;
export function getPunctuality(p=getClockParts(),shift=getDefaultShift()){return punctualityOf(minutes(p),shift)}
// El lector registra SALIDAS desde la hora de salida del turno. A las 00:00 (hora de El Salvador) vuelve a registrar ENTRADAS.
export function getAttendanceMode(p=getClockParts(),shift=getDefaultShift()){return modeOf(minutes(p),shift)}
export const EXIT_START_MIN=()=>hm(getDefaultShift().exitTime);
export function getRecordType(item){return item&&item.type==="salida"?"salida":"entrada"}
export function maskToken(t){return String(t||"").slice(0,6)+"…"}
let lastMode=null;const shown=new Map();
/* Solo toca el DOM cuando el texto cambia (casi todo cambia una vez al día, no cada segundo). */
function setText(id,v,cls){const k=v+"|"+(cls||"");if(shown.get(id)===k)return;shown.set(id,k);const e=$(id);e.textContent=v;if(cls!==undefined)e.className=cls}
function updateClock(){const p=getClockParts(),shift=getDefaultShift();$("clock").textContent=getTimeLabel(p);setText("dateText",getDateLabel());const mode=getAttendanceMode(p,shift);
if(mode==="salida"){setText("timeStatus","Registro de salida","time-status blue");setText("deadlineLabel","Salidas habilitadas desde");setText("deadlineValue",fmtHM(shift.exitTime))}
else{const s=getPunctuality(p,shift);setText("timeStatus",s.label,`time-status ${s.color}`);setText("deadlineLabel","Hora límite de entrada");setText("deadlineValue",fmtHM(hm(shift.entryLimit)+shift.graceMin))}
setText("scanMode",mode==="salida"?"Salida":"Entrada");
const ci=clockInfo(),sync=$("clockSync");if(sync)setText("clockSync",ci.synced?"Hora de El Salvador (UTC−6) · sincronizada con el servidor":"Hora de El Salvador (UTC−6) · usando el reloj del equipo","clock-sync "+(ci.synced?"ok":"warn"))
if(mode!==lastMode){console.info(`[Modo] Lector en modo ${mode.toUpperCase()}.`);if(lastMode==="entrada"&&mode==="salida")playExitAlarm();lastMode=mode}}
export function startClock(){updateClock();setInterval(updateClock,1000)}
document.addEventListener("peopledesk:schedule",()=>{if($("clock"))updateClock()});
