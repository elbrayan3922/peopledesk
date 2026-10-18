/* Horarios y turnos: carga pública (la terminal los necesita sin sesión), configuración del sistema y pantalla de edición.
 * settings/schedule  → turnos, turno predeterminado y asuetos (lectura pública, escribe RR. HH.)
 * settings/config    → parámetros de planilla y privacidad (solo personal autorizado) */
import {$,state,can,el} from "./state.js";
import {db,doc,getDoc,setDoc,serverTimestamp} from "./firebase.js";
import {normalizeShift,DEFAULT_SHIFT,hm,fmtHM,toHM,isOvernight,shiftKind,shiftSpan,LEGAL_MAX,ordinaryMinutes} from "./shift-core.js";
import {DEFAULT_PARAMS,DEFAULT_HOLIDAYS} from "./payroll.js";
import {logAudit} from "./audit.js";

const defaults=()=>({shifts:[{...DEFAULT_SHIFT}],defaultShiftId:DEFAULT_SHIFT.id,holidays:DEFAULT_HOLIDAYS.map(h=>({...h})),holy:true});
state.settings=defaults();state.config={...DEFAULT_PARAMS};

export const getShifts=()=>state.settings.shifts;
export const getDefaultShift=()=>state.settings.shifts.find(s=>s.id===state.settings.defaultShiftId)||state.settings.shifts[0]||normalizeShift();
export const shiftById=id=>state.settings.shifts.find(s=>s.id===id)||null;
export const getShiftFor=emp=>(emp&&shiftById(emp.shiftId))||getDefaultShift();
export const dowNames=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function applySchedule(d){
 const base=defaults(),shifts=(Array.isArray(d&&d.shifts)&&d.shifts.length?d.shifts:base.shifts).map(normalizeShift);
 const def=shifts.some(s=>s.id===(d&&d.defaultShiftId))?d.defaultShiftId:shifts[0].id;
 state.settings={shifts,defaultShiftId:def,holidays:Array.isArray(d&&d.holidays)?d.holidays:base.holidays,holy:d&&d.holy===false?false:true};
}
/* Pública: la usa la terminal sin sesión. Si falla, quedan los valores originales (1:00 p. m. / 5:45 p. m.). */
let schedSig=null;
export async function loadSchedule(){
 try{const s=await getDoc(doc(db,"settings","schedule"));if(s.exists())applySchedule(s.data())}catch(e){console.warn("[Horarios] Se usan los valores predeterminados:",e&&e.code||e)}
 /* Se repite cada 10 min: solo se vuelve a pintar la interfaz si los horarios cambiaron de verdad. */
 const sig=JSON.stringify(state.settings);if(sig===schedSig)return;schedSig=sig;
 document.dispatchEvent(new Event("peopledesk:schedule"));
}
export async function loadConfig(){
 try{const s=await getDoc(doc(db,"settings","config"));state.config={...DEFAULT_PARAMS,...(s.exists()?s.data():{})}}catch(e){console.warn("[Config] Parámetros predeterminados:",e&&e.code||e)}
 document.dispatchEvent(new Event("peopledesk:config"));
}

/* ===== Descripción legible de un turno ===== */
export function describeShift(s){
 const L=hm(s.entryLimit)+s.graceMin,kind=shiftKind(s),max=LEGAL_MAX[kind],ord=ordinaryMinutes(s)/60,{start,end}=shiftSpan(s);
 const lines=[`Entrada a tiempo hasta ${fmtHM(L-s.marginMin-0)}, margen final ${fmtHM(L-s.marginMin)}–${fmtHM(L)}, tardío desde ${fmtHM(L)}.`,
  `Salidas habilitadas desde ${fmtHM(s.exitTime)}${isOvernight(s)?" (del día siguiente)":""}. Ventana programada: ${((end-start)/60).toFixed(2).replace(/\.?0+$/,"")} h.`];
 const warn=[];
 if(s.hoursPerDay>max)warn.push(`Supera la jornada ordinaria legal (${max} h para jornada ${kind.toLowerCase()}): lo que pase de ${max} h se contará como hora extra.`);
 if(!s.workDays.length)warn.push("No tiene días laborables: todo se contaría como día de descanso.");
 return{kind,max,ord,lines,warn};
}

/* ===== Pantalla ===== */
let draft=null,dirty=false;
const clone=o=>JSON.parse(JSON.stringify(o));
function startDraft(){draft=clone(state.settings);dirty=false}
function mark(){dirty=true;$("shiftMessage").textContent="Cambios sin guardar."}

function shiftCard(s,i){
 const card=el("div","shift-card"+(s.id===draft.defaultShiftId?" is-default":""));
 const head=el("div","shift-head"),title=el("input");title.value=s.name;title.maxLength=40;title.setAttribute("aria-label","Nombre del turno");
 title.addEventListener("input",()=>{s.name=title.value;mark()});
 const kind=el("span","badge neutral");
 const defLabel=el("label","shift-default"),radio=el("input");radio.type="radio";radio.name="defaultShift";radio.checked=s.id===draft.defaultShiftId;
 radio.addEventListener("change",()=>{draft.defaultShiftId=s.id;mark();render()});defLabel.append(radio,document.createTextNode(" Turno predeterminado"));
 const del=el("button","mini danger","Eliminar");del.type="button";
 del.addEventListener("click",()=>{
  if(draft.shifts.length<2){$("shiftMessage").textContent="Debe existir al menos un turno.";return}
  if(s.id===draft.defaultShiftId){$("shiftMessage").textContent="No puedes eliminar el turno predeterminado: elige otro primero.";return}
  const n=state.employees.filter(e=>e.shiftId===s.id).length;
  if(n){$("shiftMessage").textContent=`Hay ${n} empleado(s) con este turno. Cámbialos de turno en Empleados antes de eliminarlo.`;return}
  draft.shifts.splice(i,1);mark();render();
 });
 head.append(title,kind,defLabel,del);card.appendChild(head);
 const grid=el("div","shift-grid");
 const f=(label,key,type,attrs={},hint="")=>{
  const w=el("div"),l=el("label",null,label),inp=el("input");inp.type=type;Object.assign(inp,attrs);inp.value=s[key];
  inp.addEventListener("input",()=>{s[key]=type==="number"?Number(inp.value):inp.value;Object.assign(s,normalizeShiftSoft(s));refreshInfo();mark()});
  w.append(l,inp);if(hint)w.appendChild(el("small","hint",hint));grid.appendChild(w);return inp;
 };
 f("Hora límite de entrada","entryLimit","time",{},"Después de esta hora la entrada es Tardía.");
 f("Hora de salida","exitTime","time",{},"Desde aquí el lector registra salidas.");
 const hours=f("Horas de trabajo por día","hoursPerDay","number",{min:.25,max:16,step:.25},"Jornada ordinaria pagada por día.");
 f("Margen final (min)","marginMin","number",{min:0,max:120,step:1},"Minutos antes del límite marcados en amarillo.");
 f("Tolerancia (min)","graceMin","number",{min:0,max:120,step:1},"Minutos de gracia después del límite.");
 f("Llegada temprano desde (min)","earlyMin","number",{min:0,max:240,step:1},"Antelación que se cuenta como temprano.");
 card.appendChild(grid);
 const days=el("div","shift-days");days.appendChild(el("span","hint","Días laborables:"));
 [1,2,3,4,5,6,0].forEach(d=>{const lb=el("label","day-chip"),cb=el("input");cb.type="checkbox";cb.checked=s.workDays.includes(d);
  cb.addEventListener("change",()=>{s.workDays=cb.checked?[...new Set([...s.workDays,d])].sort():s.workDays.filter(x=>x!==d);refreshInfo();mark()});lb.append(cb,document.createTextNode(dowNames[d]));days.appendChild(lb)});
 const calc=el("button","mini secondary","Calcular horas desde la entrada y la salida");calc.type="button";
 calc.addEventListener("click",()=>{const {start,end}=shiftSpan(s);s.hoursPerDay=Math.round((end-start)/60*4)/4;hours.value=s.hoursPerDay;refreshInfo();mark()});
 days.appendChild(calc);card.appendChild(days);
 const info=el("div","shift-info");card.appendChild(info);
 function refreshInfo(){const d=describeShift(normalizeShiftSoft(s));kind.textContent=`Jornada ${d.kind}`;info.replaceChildren(...d.lines.map(t=>el("p",null,t)),...d.warn.map(t=>el("p","shift-warn","⚠ "+t)))}
 refreshInfo();return card;
}
/* Igual que normalizeShift, pero sin recortar mientras se escribe. */
const normalizeShiftSoft=s=>({...s,hoursPerDay:Number(s.hoursPerDay)>0?Number(s.hoursPerDay):.25,marginMin:Math.max(0,Number(s.marginMin)||0),graceMin:Math.max(0,Number(s.graceMin)||0),earlyMin:Math.max(0,Number(s.earlyMin)||0),entryLimit:hm(s.entryLimit)==null?DEFAULT_SHIFT.entryLimit:s.entryLimit,exitTime:hm(s.exitTime)==null?DEFAULT_SHIFT.exitTime:s.exitTime});

function renderHolidays(){
 const box=$("holidayList");box.replaceChildren();
 draft.holidays.forEach((h,i)=>{
  const chip=el("span","perm-chip",`${h.date?h.date.split("-").reverse().join("/"):h.md.split("-").reverse().join("/")+" (cada año)"} · ${h.name}`);
  const x=el("button","chip-x","×");x.type="button";x.setAttribute("aria-label","Quitar asueto");x.addEventListener("click",()=>{draft.holidays.splice(i,1);mark();renderHolidays()});chip.appendChild(x);box.appendChild(chip);
 });
 if(!draft.holidays.length)box.appendChild(el("span","hint","Sin asuetos propios."));
}
export function renderSchedule(){
 if(!draft)startDraft();
 const box=$("shiftList");box.replaceChildren();draft.shifts.forEach((s,i)=>box.appendChild(shiftCard(s,i)));
 $("holyWeek").checked=draft.holy;renderHolidays();
}
const render=renderSchedule;
export function openSchedule(){startDraft();renderSchedule();$("shiftMessage").textContent=""}

$("shiftAdd").addEventListener("click",()=>{
 const id="t"+Date.now().toString(36);draft.shifts.push(normalizeShift({id,name:`Turno ${draft.shifts.length+1}`}));mark();render();
});
$("holyWeek").addEventListener("change",()=>{draft.holy=$("holyWeek").checked;mark()});
$("holidayReset").addEventListener("click",()=>{draft.holidays=DEFAULT_HOLIDAYS.map(h=>({...h}));draft.holy=true;mark();render()});
$("holidayForm").addEventListener("submit",e=>{
 e.preventDefault();const d=$("holidayDate").value,name=$("holidayName").value.trim();
 if(!d||!name)return;draft.holidays.push($("holidayYearly").checked?{md:d.slice(5),name}:{date:d,name});$("holidayName").value="";mark();renderHolidays();
});
$("shiftSave").addEventListener("click",async()=>{
 if(!can.hr())return;const msg=$("shiftMessage");
 const shifts=draft.shifts.map(normalizeShift);
 if(new Set(shifts.map(s=>s.name.trim().toLowerCase())).size!==shifts.length){msg.textContent="Dos turnos tienen el mismo nombre.";return}
 $("shiftSave").disabled=true;msg.textContent="Guardando...";
 try{
  const before=state.settings,payload={shifts,defaultShiftId:draft.defaultShiftId,holidays:draft.holidays,holy:draft.holy,updatedAt:serverTimestamp(),updatedBy:state.currentUser.email||""};
  await setDoc(doc(db,"settings","schedule"),payload);
  applySchedule(payload);draft=null;startDraft();render();
  const diff=shifts.map(s=>{const o=before.shifts.find(x=>x.id===s.id);return !o?`+${s.name}`:(o.entryLimit!==s.entryLimit||o.exitTime!==s.exitTime||o.hoursPerDay!==s.hoursPerDay?`${s.name}: ${fmtHM(o.entryLimit)}→${fmtHM(s.entryLimit)}, salida ${fmtHM(o.exitTime)}→${fmtHM(s.exitTime)}, ${o.hoursPerDay}→${s.hoursPerDay} h`:null)}).filter(Boolean);
  await logAudit("Horarios actualizados","settings/schedule",diff.join(" | ")||"Sin cambios en horas");
  msg.textContent="Horarios guardados. La terminal los aplica en pocos minutos (o al recargar).";document.dispatchEvent(new Event("peopledesk:schedule"));
 }catch(err){console.error(err);msg.textContent="No se pudieron guardar los horarios. Revisa tus permisos y las reglas de Firestore."}
 finally{$("shiftSave").disabled=false}
});
