/* Motor de planilla (VISTA PREVIA TEMPORAL). Funciones puras: no tocan pantalla ni Firebase.
 * Es una estimación orientativa basada en el Código de Trabajo de El Salvador; no sustituye a tu contador ni a un abogado.
 * Reglas aplicadas (todas editables en Administración → Parámetros):
 *  - Jornada ordinaria: diurna 8 h, mixta 7,5 h, nocturna 7 h por día. Nocturno = 7:00 p. m. a 6:00 a. m.
 *  - Hora extra: 100 % de recargo (+ recargo de nocturnidad configurable si cae en horario nocturno).
 *  - Trabajo en día de descanso: recargo del 50 %. Trabajo en asueto: recargo del 100 %.
 *  - Tardanza y salida anticipada: se descuenta solo el tiempo no trabajado (proporcional al valor hora).
 *  - Falta injustificada: se descuenta un día de salario. */
import {hm,isOvernight,shiftSpan,shiftKind,nightMinutes,LEGAL_MAX,ordinaryMinutes} from "./shift-core.js";

export const DEFAULT_PARAMS={otPct:100,nightPct:25,restPct:50,holidayPct:100,monthDays:30,permWithPay:true,defaultSalary:365,biometricEnabled:true,retentionMonths:12,otMinMin:15};

/* "1:05:30 p. m." → segundos desde la medianoche (o null). */
export function parseTimeLabel(label){
 const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])/i.exec(String(label||"").trim());if(!m)return null;
 let h=+m[1]%12;if(m[4].toLowerCase()==="p")h+=12;return h*3600+(+m[2])*60+(+(m[3]||0));
}
const pad=n=>String(n).padStart(2,"0");
export const addDays=(key,n)=>{const d=new Date(key+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const dowOf=key=>new Date(key+"T12:00:00Z").getUTCDay();   // 0 = domingo
export function monthDates(month){const [y,m]=month.split("-").map(Number),n=new Date(Date.UTC(y,m,0)).getUTCDate();return Array.from({length:n},(_,i)=>`${y}-${pad(m)}-${pad(i+1)}`)}

/* Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return `${y}-${pad(mo)}-${pad(da)}`}
export const DEFAULT_HOLIDAYS=[{md:"01-01",name:"Año Nuevo"},{md:"05-01",name:"Día del Trabajo"},{md:"08-06",name:"Fiesta del Divino Salvador (San Salvador)"},{md:"09-15",name:"Día de la Independencia"},{md:"11-02",name:"Día de los Difuntos"},{md:"12-25",name:"Navidad"}];
/* Mapa fecha → nombre del asueto para los años del mes pedido. holy = incluir Jueves, Viernes y Sábado Santo. */
export function holidayMap(month,list=DEFAULT_HOLIDAYS,holy=true){
 const map=new Map(),[y]=month.split("-").map(Number);
 for(const h of list||[]){if(h.date)map.set(h.date,h.name);else if(h.md)map.set(`${y}-${h.md}`,h.name)}
 if(holy){const e=easter(y);map.set(addDays(e,-3),"Jueves Santo");map.set(addDays(e,-2),"Viernes Santo");map.set(addDays(e,-1),"Sábado Santo")}
 return map;
}

const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const hrs=min=>Math.round(min/60*100)/100;

/* Calcula un empleado para un mes.
 * in: {shift, month:"YYYY-MM", records:[attendance docs], permissions:[...], holidays:Map, params, salary}
 * out: {days:[...filas], totals:{...}} */
export function computeMonth({shift,month,records,permissions=[],holidays=new Map(),params=DEFAULT_PARAMS,salary,asOf,fromDate}){
 const P={...DEFAULT_PARAMS,...params},sal=Number(salary)>0?Number(salary):P.defaultSalary,usedDefault=!(Number(salary)>0);
 const ord=ordinaryMinutes(shift),kind=shiftKind(shift),{start:S}=shiftSpan(shift),E=shiftSpan(shift).end,over=isOvernight(shift);
 const daily=sal/P.monthDays,hourly=daily/(ord/60);
 const byDate=new Map();for(const r of records){const k=r.date;if(!byDate.has(k))byDate.set(k,{});byDate.get(k)[r.type==="salida"?"exit":"entry"]=r}
 const permOn=d=>permissions.find(p=>p.status==="Aprobado"&&p.dateFrom<=d&&p.dateTo>=d);
 const T={sal,usedDefault,hourly:r2(hourly),kind,ordHours:hrs(ord),worked:0,expected:0,absences:0,onTime:0,margin:0,late:0,early:0,lateMin:0,earlyLeaveMin:0,incomplete:0,
  ordMin:0,dayMin:0,nightMin:0,extraDayMin:0,extraNightMin:0,restWorked:0,holWorked:0,vacTaken:0,vacWorked:0,permDays:0,discount:0,extraPay:0,restPay:0,holPay:0};
 const days=[];
 for(const date of monthDates(month)){
  if(asOf&&date>asOf)break;if(fromDate&&date<fromDate)continue;
  const dow=dowOf(date),hol=holidays.get(date)||"",perm=permOn(date),fullPerm=perm&&!perm.partial?perm:null,isVac=!!fullPerm&&/vacaci/i.test(fullPerm.type),workday=shift.workDays.includes(dow);
  const rec=byDate.get(date)||{},entry=rec.entry,exitRec=rec.exit||(over?(byDate.get(addDays(date,1))||{}).exit:null);
  if(workday&&!hol&&!isVac)T.expected++;
  if(isVac)T.vacTaken++;else if(fullPerm)T.permDays++;
  const row={date,dow,holiday:hol,perm:perm?perm.type:"",status:"",entry:"",exit:"",earlyMin:0,lateMin:0,leaveMin:0,counted:0,ord:0,day:0,night:0,exDay:0,exNight:0,dayType:hol?"Asueto":workday?"Laborable":"Descanso",discount:0,pay:0,note:""};
  if(!entry&&!exitRec){
   if(workday&&!hol&&!fullPerm&&date===asOf){row.status="Pendiente";row.note="El día aún no termina";days.push(row)}
   else if(workday&&!hol&&!fullPerm){row.status="Falta";row.discount=daily;row.note="Falta injustificada";T.absences++;T.discount+=daily;days.push(row)}
   else if(fullPerm){row.status=isVac?"Vacaciones":"Permiso";row.note=fullPerm.type;days.push(row)}
   continue;
  }
  const eS=entry?parseTimeLabel(entry.time):null,xS=exitRec?parseTimeLabel(exitRec.time):null;
  row.entry=entry?entry.time:"";row.exit=exitRec?exitRec.time:"";
  if(eS==null||xS==null){row.status=eS==null?"Sin entrada":"Sin salida";row.note="Marca incompleta: revisar y corregir";T.incomplete++;if(eS!=null)T.worked++;days.push(row);continue}
  let a=eS/60,b=xS/60;if(over&&a<S-720)a+=1440;                     // llegada pasada la medianoche en turno nocturno
  if(b<=a)b+=1440;
  const graceEnd=S+(shift.graceMin||0);
  row.earlyMin=Math.max(0,Math.floor(S-a));row.lateMin=Math.max(0,Math.ceil(a-graceEnd));
  const start=Math.max(a,S);let counted=Math.max(0,Math.round(b-start));const ordMin=Math.min(counted,ord);if(counted-ordMin<P.otMinMin)counted=ordMin;const extra=counted-ordMin;   // menos de otMinMin minutos de más no se cuentan como extra
  const split=(x,y)=>{const n=Math.round(nightMinutes(x,y));return[Math.max(0,Math.round(y-x)-n),n]};
  const [oD,oN]=split(start,start+ordMin),[xD,xN]=split(start+ordMin,start+counted);
  const sched=workday&&!hol,short=sched?Math.max(0,ord-counted):0,late=Math.min(row.lateMin,short),leave=short-late;
  const paidPerm=perm&&P.permWithPay;
  Object.assign(row,{counted,ord:ordMin,day:oD,night:oN,exDay:xD,exNight:xN,leaveMin:leave});
  if(!sched){row.lateMin=0;row.earlyMin=0}
  const L=S+(shift.graceMin||0);
  row.status=!sched?"Trabajó":a>=L?"Tardío":a>=L-shift.marginMin?"Margen final":a<=S-shift.earlyMin?"Temprano":"A tiempo";
  T.worked++;T.ordMin+=ordMin;T.dayMin+=oD;T.nightMin+=oN;T.extraDayMin+=xD;T.extraNightMin+=xN;T.lateMin+=late;T.earlyLeaveMin+=leave;
  if(row.status==="Tardío")T.late++;else if(row.status==="Temprano")T.early++;else if(row.status==="Margen final")T.margin++;else if(row.status==="A tiempo")T.onTime++;
  // Descuento: solo el tiempo no trabajado, y nada si el permiso aprobado es con goce.
  row.discount=paidPerm?0:r2(short/60*hourly);if(paidPerm&&short)row.note="Permiso aprobado: sin descuento";
  T.discount+=row.discount;
  // Pagos adicionales
  let pay=r2(hrs(xD*1)*hourly*(1+P.otPct/100)+hrs(xN*1)*hourly*(1+(P.otPct+P.nightPct)/100));
  T.extraPay+=pay;
  if(hol){row.dayType="Asueto trabajado";T.holWorked++;const x=r2(hrs(counted)*hourly*P.holidayPct/100);T.holPay+=x;pay+=x}
  else if(!workday){row.dayType="Descanso trabajado";T.restWorked++;const x=r2(hrs(counted)*hourly*P.restPct/100);T.restPay+=x;pay+=x;row.note=(row.note?row.note+" · ":"")+"Corresponde día compensatorio remunerado"}
  if(isVac){row.dayType="Vacación trabajada";T.vacWorked++;row.note=(row.note?row.note+" · ":"")+"Trabajó en vacaciones: revisar"}
  row.pay=r2(pay);days.push(row);
 }
 T.discount=r2(T.discount);T.extraPay=r2(T.extraPay);T.restPay=r2(T.restPay);T.holPay=r2(T.holPay);
 T.net=r2(sal-T.discount+T.extraPay+T.restPay+T.holPay);
 return{days,totals:T};
}
