/* Planilla (vista previa temporal): muestra en pantalla, con aspecto de hoja de Excel, cómo quedarían los datos de cada empleado,
 * y descarga exactamente esas mismas hojas. Los cálculos viven en payroll.js. */
import {$,state,can,el,TZ} from "./state.js";
import {db,collection,getDocs,query,where} from "./firebase.js";
import {getDateKey} from "./time.js";
import {getShiftFor,dowNames} from "./schedule.js";
import {fmtHM,shiftKind,ordinaryMinutes,LEGAL_MAX} from "./shift-core.js";
import {computeMonth,holidayMap,monthDates,addDays,DEFAULT_PARAMS} from "./payroll.js";
import {loadPermissions} from "./permissions.js";
import {logAudit} from "./audit.js";
import {ensureXLSX} from "./lib.js";

const COLS="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const colName=i=>i<26?COLS[i]:COLS[Math.floor(i/26)-1]+COLS[i%26];
const h2=min=>Math.round(min/60*100)/100;
let sheets=null,tab="resumen",lastMonth="";

function empDateKey(e){try{const d=e.createdAt&&e.createdAt.toDate?e.createdAt.toDate():null;return d?new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d):null}catch{return null}}

export function buildSheets({month,results,params,holidays}){
 const T=[["Código","t"],["Empleado","t"],["Turno","t"],["Jornada","t"],["Días laborables","n"],["Días trabajados","n"],["Faltas","n"],["A tiempo","n"],["Margen final","n"],["Tardías","n"],["Tempranas","n"],["Min. tarde","n"],["Min. salida antic.","n"],["H. ordinarias","h"],["H. diurnas","h"],["H. nocturnas","h"],["H. extra diurnas","h"],["H. extra nocturnas","h"],["Descansos trabajados","n"],["Asuetos trabajados","n"],["Vacaciones tomadas","n"],["Vacaciones trabajadas","n"],["Salario base","m"],["Valor hora","m"],["Descuento","m"],["Pago horas extra","m"],["Recargo descanso/asueto","m"],["Total estimado","m"],["Marcas incompletas","n"]];
 const resumen={headers:T.map(x=>x[0]),types:T.map(x=>x[1]),rows:results.map(({emp,shift,totals:t})=>[emp.code,emp.name,shift.name,t.kind,t.expected,t.worked,t.absences,t.onTime,t.margin,t.late,t.early,t.lateMin,t.earlyLeaveMin,h2(t.ordMin),h2(t.dayMin),h2(t.nightMin),h2(t.extraDayMin),h2(t.extraNightMin),t.restWorked,t.holWorked,t.vacTaken,t.vacWorked,t.sal,t.hourly,t.discount,t.extraPay,Math.round((t.restPay+t.holPay)*100)/100,t.net,t.incomplete])};
 const D=[["Fecha","t"],["Día","t"],["Código","t"],["Empleado","t"],["Tipo de día","t"],["Estado","s"],["Entrada","t"],["Salida","t"],["Min. antes","n"],["Min. tarde","n"],["H. ordinarias","h"],["H. diurnas","h"],["H. nocturnas","h"],["Extra diurna","h"],["Extra nocturna","h"],["Descuento","m"],["Pago adicional","m"],["Observación","t"]];
 const rows=[];
 results.forEach(({emp,totals,days})=>days.forEach(d=>rows.push([d.date.split("-").reverse().join("/"),dowNames[d.dow],emp.code,emp.name,d.holiday&&d.dayType==="Laborable"?"Asueto":d.dayType,d.status,d.entry||"—",d.exit||"—",d.earlyMin,d.lateMin,h2(d.ord),h2(d.day),h2(d.night),h2(d.exDay),h2(d.exNight),Math.round(d.discount*100)/100,d.pay,[d.holiday&&!/Asueto/.test(d.dayType)?d.holiday:"",d.perm&&!/^Vacac|^Permiso/.test(d.status)?"Permiso: "+d.perm:"",d.note].filter(Boolean).join(" · ")])));
 rows.sort((a,b)=>a[0].split("/").reverse().join("").localeCompare(b[0].split("/").reverse().join(""))||String(a[3]).localeCompare(String(b[3]),"es"));
 const detalle={headers:D.map(x=>x[0]),types:D.map(x=>x[1]),rows};
 const P={...DEFAULT_PARAMS,...params},hol=[...holidays].sort().map(([d,n])=>`${d.split("-").reverse().join("/")} · ${n}`);
 const reglas={headers:["Regla aplicada en esta vista previa"],types:["t"],rows:[
  ["ESTIMACIÓN TEMPORAL: orientativa, no sustituye la planilla oficial ni la asesoría de un contador o abogado."],
  [`Mes calculado: ${month}. Salario mensual base ÷ ${P.monthDays} días = salario diario; ÷ horas ordinarias del turno = valor hora.`],
  [`Jornada ordinaria máxima por día: Diurna ${LEGAL_MAX.Diurna} h · Mixta ${LEGAL_MAX.Mixta} h · Nocturna ${LEGAL_MAX.Nocturna} h. Diurno = 6:00 a. m.–7:00 p. m.; nocturno = 7:00 p. m.–6:00 a. m.`],
  [`Hora extra: valor hora + ${P.otPct} % de recargo. Si cae en horario nocturno suma además ${P.nightPct} % del valor hora. Menos de ${P.otMinMin} minutos de más no se cuentan.`],
  [`Trabajo en día de descanso semanal: recargo de ${P.restPct} % sobre las horas trabajadas y día compensatorio remunerado pendiente.`],
  [`Trabajo en asueto: recargo de ${P.holidayPct} % sobre las horas trabajadas.`],
  ["Tardanza y salida anticipada: se descuenta únicamente el tiempo no trabajado, proporcional al valor hora."],
  ["Falta injustificada en día laborable: se descuenta un día de salario. Los permisos aprobados "+(P.permWithPay?"se tratan como CON goce (sin descuento).":"se tratan como SIN goce.")],
  ["Llegada temprano: se muestra, pero los minutos anteriores a la hora de entrada del turno no se pagan como extra."],
  ["Vacaciones: días con permiso aprobado de tipo «Vacaciones». Si el empleado marca en un día de vacaciones se cuenta como «vacación trabajada» para revisión."],
  ["No incluye ISSS, AFP, renta ni otras retenciones; solo asistencia, horas y descuentos por tiempo."],
  [`Salario base: el del empleado; si no tiene, se usa el de referencia ($${P.defaultSalary}). Se editan en Empleados y en Administración → Parámetros.`],
  ["Asuetos considerados: "+(hol.join("; ")||"ninguno")]
 ]};
 return{resumen,detalle,reglas};
}

const MONEY=n=>"$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const CHIP={"A tiempo":"ok","Temprano":"early","Margen final":"warn","Tardío":"late","Falta":"absent","Vacaciones":"perm","Permiso":"perm","Sin salida":"late","Sin entrada":"late","Trabajó":"ok","Pendiente":"neutral"};
function renderSheet(box,sh,{totals=false}={}){
 box.replaceChildren();
 const wrap=el("div","xl-wrap"),tbl=el("table","xl"),thead=el("thead"),letters=el("tr","xl-letters");
 letters.appendChild(el("th","xl-corner",""));sh.headers.forEach((_,i)=>letters.appendChild(el("th",null,colName(i))));
 const hr=el("tr");hr.appendChild(el("th","xl-rownum","1"));sh.headers.forEach((h,i)=>hr.appendChild(el("th","xl-head"+(sh.types[i]==="t"||sh.types[i]==="s"?"":" num"),h)));
 thead.append(letters,hr);tbl.appendChild(thead);
 const body=el("tbody"),MAXR=800;
 sh.rows.slice(0,MAXR).forEach((r,ri)=>{
  const tr=el("tr");tr.appendChild(el("td","xl-rownum",String(ri+2)));
  r.forEach((v,i)=>{const t=sh.types[i],td=el("td",t==="t"||t==="s"?"":"num");
   if(t==="s"){td.appendChild(el("span","xl-chip "+(CHIP[v]||"neutral"),String(v)))}
   else if(t==="m"){td.textContent=v?MONEY(v):"—";if(sh.headers[i]==="Descuento"&&v)td.classList.add("neg");if(sh.headers[i]==="Total estimado")td.classList.add("strong")}
   else if(t==="h"||t==="n"){td.textContent=v?String(v):"·";if(!v)td.classList.add("zero")}
   else td.textContent=v==null?"":String(v);
   tr.appendChild(td)});
  body.appendChild(tr);
 });
 if(totals&&sh.rows.length>1){
  const tr=el("tr","xl-total");tr.appendChild(el("td","xl-rownum","Σ"));
  sh.headers.forEach((_,i)=>{const t=sh.types[i],td=el("td",t==="t"||t==="s"?"":"num");
   if(i===1)td.textContent="Totales";else if(t==="n"||t==="h"||t==="m"){if(/Valor hora|Salario base/.test(sh.headers[i]))td.textContent="";else{const s=Math.round(sh.rows.reduce((a,r)=>a+(Number(r[i])||0),0)*100)/100;td.textContent=t==="m"?MONEY(s):String(s)}}
   tr.appendChild(td)});body.appendChild(tr);
 }
 tbl.appendChild(body);wrap.appendChild(tbl);box.appendChild(wrap);
 if(sh.rows.length>MAXR)box.appendChild(el("p","hint",`Se muestran las primeras ${MAXR} filas; el Excel descargado trae todas.`));
 if(!sh.rows.length)box.appendChild(el("p","dash-empty","No hay datos para mostrar en este mes."));
}
function renderRules(box,sh){box.replaceChildren();const ul=el("ul","rules-list");sh.rows.forEach(r=>ul.appendChild(el("li",null,r[0])));box.appendChild(ul)}

function show(){
 if(!sheets)return;
 document.querySelectorAll("#payTabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
 const box=$("paySheet");
 if(tab==="reglas")renderRules(box,sheets.reglas);else renderSheet(box,tab==="resumen"?sheets.resumen:sheets.detalle,{totals:tab==="resumen"});
}
document.querySelectorAll("#payTabs button").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;show()}));

export async function calculatePayroll(){
 if(!can.hr())return;const msg=$("payMessage"),month=$("payMonth").value;
 if(!/^\d{4}-\d{2}$/.test(month)){msg.textContent="Elige el mes a calcular.";return}
 $("payCalc").disabled=true;msg.textContent="Leyendo asistencia y calculando...";
 try{
  const dates=monthDates(month),from=dates[0],to=addDays(dates[dates.length-1],1);
  const [snap]=await Promise.all([getDocs(query(collection(db,"attendance"),where("date",">=",from),where("date","<=",to))),loadPermissions()]);
  const recs=snap.docs.map(d=>d.data()),by=new Map();recs.forEach(r=>{if(!by.has(r.employeeId))by.set(r.employeeId,[]);by.get(r.employeeId).push(r)});
  const only=$("payEmployee").value,holidays=holidayMap(month,state.settings.holidays,state.settings.holy),params=state.config||DEFAULT_PARAMS,today=getDateKey();
  const emps=state.employees.filter(e=>(e.status!=="Inactivo"||by.has(e.id))&&(!only||e.id===only)).sort((a,b)=>String(a.name).localeCompare(String(b.name),"es"));
  const results=emps.map(emp=>{const shift=getShiftFor(emp);return{emp,shift,...computeMonth({shift,month,records:by.get(emp.id)||[],permissions:state.permissions.filter(p=>p.employeeId===emp.id),holidays,params,salary:emp.salary,asOf:today,fromDate:empDateKey(emp)})}});
  sheets=buildSheets({month,results,params,holidays});lastMonth=month;show();
  $("payExport").disabled=!results.length;
  msg.textContent=results.length?`${results.length} empleado(s) · ${sheets.detalle.rows.length} fila(s) de detalle.`:"No hay empleados para calcular.";
 }catch(err){console.error(err);msg.textContent="No se pudo calcular. Revisa tu sesión y las reglas de Firestore."}
 finally{$("payCalc").disabled=false}
}
$("payCalc").addEventListener("click",calculatePayroll);
$("payMonth").addEventListener("change",()=>{sheets=null;$("payExport").disabled=true});
$("payExport").addEventListener("click",async()=>{
 if(!sheets)return;if(!(await ensureXLSX())){$("payMessage").textContent="No se pudo cargar la librería de Excel. Recarga la página.";return}
 const wb=XLSX.utils.book_new(),add=(sh,name,widths)=>{
  const ws=XLSX.utils.aoa_to_sheet([sh.headers,...sh.rows]);ws["!cols"]=widths||sh.headers.map((h,i)=>({wch:Math.max(10,Math.min(40,h.length+4,sh.types[i]==="t"?28:12))}));
  sh.types.forEach((t,c)=>{if(t==="m")for(let r=1;r<=sh.rows.length;r++){const a=XLSX.utils.encode_cell({r,c});if(ws[a])ws[a].z="$#,##0.00"}});
  XLSX.utils.book_append_sheet(wb,ws,name)};
 add(sheets.resumen,"Resumen");add(sheets.detalle,"Detalle diario");
 const wr=XLSX.utils.aoa_to_sheet([sheets.reglas.headers,...sheets.reglas.rows]);wr["!cols"]=[{wch:140}];XLSX.utils.book_append_sheet(wb,wr,"Reglas aplicadas");
 XLSX.writeFile(wb,`planilla_estimada_${lastMonth}.xlsx`);
 $("payMessage").textContent="Excel descargado (vista previa temporal).";await logAudit("Planilla estimada exportada",lastMonth,`${sheets.resumen.rows.length} empleado(s)`);
});
export function openPayroll(){
 if(!$("payMonth").value)$("payMonth").value=getDateKey().slice(0,7);
 const sel=$("payEmployee"),prev=sel.value;sel.replaceChildren(new Option("Todos los empleados",""));
 state.employees.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),"es")).forEach(e=>sel.appendChild(new Option(`${e.code} · ${e.name}`,e.id)));
 if([...sel.options].some(o=>o.value===prev))sel.value=prev;
}
