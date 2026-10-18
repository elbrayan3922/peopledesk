/* Núcleo de turnos: matemática pura (sin pantalla ni Firebase) para poder probarla y usarla en terminal, panel y planilla.
 * Las horas se guardan como "HH:MM" (24 h) y se calculan en minutos desde la medianoche. */

export const NIGHT_START=19*60;          // la jornada nocturna empieza a las 7:00 p. m.
export const NIGHT_END=6*60;             // y termina a las 6:00 a. m. del día siguiente
export const LEGAL_MAX={Diurna:8,Mixta:7.5,Nocturna:7}; // horas ordinarias máximas por día (ajusta si tu asesor indica otra cosa)

export const hm=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||"").trim());if(!m)return null;const h=+m[1],n=+m[2];return h>23||n>59?null:h*60+n};
export const toHM=n=>{n=((Math.round(n)%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`};
export function fmtHM(v){const n=typeof v==="number"?v:hm(v);if(n==null)return"—";const h=Math.floor(n/60)%24,m=n%60;return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"p. m.":"a. m."}`}

/* Turno que replica el comportamiento original del sistema (límite 1:00 p. m., salidas desde 5:45 p. m.). */
export const DEFAULT_SHIFT={id:"std",name:"Turno estándar",entryLimit:"13:00",marginMin:5,graceMin:0,earlyMin:15,exitTime:"17:45",hoursPerDay:4.75,workDays:[1,2,3,4,5]};

export function normalizeShift(s){
 const d=DEFAULT_SHIFT,o={...d,...(s||{})};
 o.id=String(o.id||d.id);o.name=String(o.name||"Turno").slice(0,40);
 if(hm(o.entryLimit)==null)o.entryLimit=d.entryLimit;if(hm(o.exitTime)==null)o.exitTime=d.exitTime;
 const num=(v,def,min,max)=>{v=Number(v);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):def};
 o.marginMin=num(o.marginMin,5,0,120);o.graceMin=num(o.graceMin,0,0,120);o.earlyMin=num(o.earlyMin,15,0,240);o.hoursPerDay=num(o.hoursPerDay,d.hoursPerDay,0.25,16);
 o.workDays=Array.isArray(o.workDays)?[...new Set(o.workDays.map(Number).filter(x=>x>=0&&x<=6))].sort():d.workDays.slice();
 return o;
}
export const isOvernight=s=>hm(s.exitTime)<=hm(s.entryLimit);
export const shiftSpan=s=>{const a=hm(s.entryLimit),b=hm(s.exitTime);return{start:a,end:b+(b<=a?1440:0)}};

/* Minutos de [a,b) (minutos absolutos desde la medianoche del día 0) que caen en horario nocturno. */
export function nightMinutes(a,b){
 if(b<=a)return 0;let t=0;
 for(let k=Math.floor(a/1440)-1;k<=Math.floor(b/1440);k++){
  for(const [x,y] of [[k*1440,k*1440+NIGHT_END],[k*1440+NIGHT_START,(k+1)*1440]]){const lo=Math.max(a,x),hi=Math.min(b,y);if(hi>lo)t+=hi-lo}
 }
 return t;
}
/* Diurna (sin horas nocturnas), Nocturna (3,5 h o más nocturnas) o Mixta (en medio). */
export function shiftKind(s){const {start,end}=shiftSpan(s),n=nightMinutes(start,end);return n===0?"Diurna":n>=210?"Nocturna":"Mixta"}
export const ordinaryMinutes=s=>Math.round(Math.min(s.hoursPerDay,LEGAL_MAX[shiftKind(s)])*60);

/* Puntualidad de una entrada (m = minuto del día). Mismas reglas del sistema original:
 * "Margen final" son los últimos marginMin minutos antes del límite; desde el límite (más la tolerancia) es "Tardío". */
export function punctualityOf(m,s){
 const L=hm(s.entryLimit)+(s.graceMin||0),d=((m-L+720+1440)%1440)-720;
 if(d<-s.marginMin)return{label:"A tiempo",color:"green"};
 if(d<0)return{label:"Margen final",color:"orange"};
 return{label:"Tardío",color:"red"};
}
/* ¿El lector registra ENTRADA o SALIDA a esa hora? Turno normal: salida desde la hora de salida hasta medianoche.
 * Turno que cruza medianoche: salida de 00:00 a la hora de salida; el resto del día, entrada. */
export function modeOf(m,s){
 const e=hm(s.exitTime);
 return isOvernight(s)?(m<e?"salida":"entrada"):(m>=e?"salida":"entrada");
}
