/* Panel de control: resumen del día calculado con los datos ya cargados (no hace consultas nuevas). */
import {$,state} from "./state.js";
import {getDateKey,getRecordType} from "./time.js";
import {getMethodLabel} from "./attendance.js";

/* Cálculo puro (se puede probar sin pantalla). */
export function computeDashboard({employees,attendance,permissions,today}){
 const active=employees.filter(e=>e.status!=="Inactivo"),ids=new Set(active.map(e=>e.id));
 const entries=attendance.filter(r=>getRecordType(r)!=="salida"&&ids.has(r.employeeId));
 const exits=attendance.filter(r=>getRecordType(r)==="salida"&&ids.has(r.employeeId));
 const present=new Set(entries.map(r=>r.employeeId));
 const count=label=>entries.filter(r=>r.punctuality===label).length;
 const permIds=new Set(permissions.filter(p=>p.status==="Aprobado"&&p.dateFrom<=today&&p.dateTo>=today&&ids.has(p.employeeId)).map(p=>p.employeeId));
 const permOnly=[...permIds].filter(id=>!present.has(id)).length;
 const missing=active.filter(e=>!present.has(e.id)&&!permIds.has(e.id));
 const expected=active.length-permOnly;
 const depts=new Map();
 active.forEach(e=>{const k=e.department||"Sin departamento",d=depts.get(k)||{name:k,total:0,present:0};d.total++;if(present.has(e.id))d.present++;depts.set(k,d)});
 return{
  active:active.length,total:employees.length,presentCount:present.size,exitCount:exits.length,
  onTime:count("A tiempo"),margin:count("Margen final"),late:count("Tardío"),
  permCount:permIds.size,permOnly,missing,expected,
  rate:expected>0?Math.round(present.size/expected*100):null,
  departments:[...depts.values()].sort((a,b)=>a.name.localeCompare(b.name,"es"))
 };
}

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const NS="http://www.w3.org/2000/svg";

function renderRing(d){
 const box=$("dashRing");box.replaceChildren();
 const C=2*Math.PI*74,svg=document.createElementNS(NS,"svg");
 svg.setAttribute("viewBox","0 0 176 176");svg.setAttribute("class","ring");svg.setAttribute("role","img");
 svg.setAttribute("aria-label",d.rate==null?"Sin datos de asistencia":`${d.rate}% de asistencia`);
 ["ring-bg","ring-fg"].forEach(cls=>{
  const c=document.createElementNS(NS,"circle");
  c.setAttribute("class",cls);c.setAttribute("cx","88");c.setAttribute("cy","88");c.setAttribute("r","74");
  if(cls==="ring-fg"){c.setAttribute("stroke-dasharray",String(C));c.setAttribute("stroke-dashoffset",String(C*(1-(d.rate||0)/100)))}
  svg.appendChild(c);
 });
 const center=el("div","ring-center");
 center.appendChild(el("strong","",d.rate==null?"—":`${d.rate}%`));center.appendChild(el("span","","de asistencia"));
 const wrap=el("div","ring-wrap");wrap.appendChild(svg);wrap.appendChild(center);
 const legend=el("ul","legend");
 [["green","A tiempo",d.onTime],["amber","Margen final",d.margin],["red","Tardíos",d.late],["violet","Con permiso",d.permCount],["gray","Sin registro",d.missing.length]].forEach(([c,label,n])=>{
  const li=el("li");li.appendChild(el("span","dot "+c));li.appendChild(el("span","",label));li.appendChild(el("b","",String(n)));legend.appendChild(li);
 });
 const block=el("div","ring-block");block.appendChild(wrap);block.appendChild(legend);box.appendChild(block);
}

function renderDepartments(d){
 const box=$("dashDept");box.replaceChildren();
 if(!d.departments.length){box.appendChild(el("p","dash-empty","Aún no hay empleados registrados."));return}
 const list=el("div","dept-list");
 d.departments.forEach(x=>{
  const row=el("div"),top=el("div","dept-row-top");
  top.appendChild(el("span","",x.name));top.appendChild(el("span","",`${x.present} de ${x.total}`));
  const bar=el("div","bar"),fill=el("i");fill.style.width=`${x.total?Math.round(x.present/x.total*100):0}%`;bar.appendChild(fill);
  row.appendChild(top);row.appendChild(bar);list.appendChild(row);
 });
 box.appendChild(list);
}

function renderRecent(){
 const body=$("dashRecent");body.replaceChildren();
 const rows=state.attendance.slice(0,8);
 rows.forEach(r=>{
  const tr=el("tr"),isExit=getRecordType(r)==="salida";
  tr.appendChild(el("td","",r.time||""));tr.appendChild(el("td","",r.name||""));
  const t1=el("td"),b1=el("span","badge "+(isExit?"exit":"neutral"),isExit?"Salida":"Entrada");t1.appendChild(b1);tr.appendChild(t1);
  tr.appendChild(el("td","",getMethodLabel(r)));
  const t2=el("td");
  if(isExit)t2.textContent="—";
  else{const b=el("span","badge",r.punctuality||"");if(r.punctuality==="Tardío")b.classList.add("late");else if(r.punctuality==="Margen final")b.classList.add("warn");t2.appendChild(b)}
  tr.appendChild(t2);body.appendChild(tr);
 });
 $("dashRecentEmpty").style.display=rows.length?"none":"block";
}

function renderPending(d,today){
 const box=$("dashPending");box.replaceChildren();
 const h1=el("h3","","Sin registro todavía");box.appendChild(h1);
 if(!d.active)box.appendChild(el("p","dash-empty","Registra empleados para ver quién falta."));
 else if(!d.missing.length)box.appendChild(el("p","dash-empty","Todos los empleados activos tienen registro o permiso."));
 else{
  const ul=el("ul","pending-list");
  d.missing.slice(0,8).forEach(e=>{const li=el("li");li.appendChild(el("span","",e.name||""));li.appendChild(el("small","",e.position||""));ul.appendChild(li)});
  if(d.missing.length>8){const li=el("li");li.appendChild(el("small","",`y ${d.missing.length-8} más`));ul.appendChild(li)}
  box.appendChild(ul);
 }
 box.appendChild(el("h3","","Con permiso hoy"));
 const act=state.permissions.filter(p=>p.status==="Aprobado"&&p.dateFrom<=today&&p.dateTo>=today);
 if(!act.length)box.appendChild(el("p","dash-empty","Nadie tiene permiso aprobado hoy."));
 else{const chips=el("div","perm-chips");act.forEach(p=>chips.appendChild(el("span","perm-chip",`${p.name} · ${p.type}${p.partial?` (${p.startTime}–${p.endTime})`:""}`)));box.appendChild(chips)}
}

export function renderDashboard(){
 const today=getDateKey(),d=computeDashboard({employees:state.employees,attendance:state.attendance,permissions:state.permissions,today});
 $("kpiActive").textContent=d.active;$("kpiActiveSub").textContent=d.total>d.active?`de ${d.total} registrados`:"en la plantilla";
 $("kpiPresent").textContent=d.presentCount;$("kpiPresentSub").textContent=d.rate==null?"sin datos todavía":`${d.rate}% de asistencia`;
 $("kpiLate").textContent=d.late;$("kpiLateSub").textContent=d.margin?`y ${d.margin} en margen final`:"llegadas fuera de hora";
 $("kpiPermission").textContent=d.permCount;$("kpiPermissionSub").textContent="aprobados hoy";
 $("kpiMissing").textContent=d.missing.length;$("kpiMissingSub").textContent="sin entrada ni permiso";
 renderRing(d);renderDepartments(d);renderRecent();renderPending(d,today);
}

/* Se vuelve a pintar cuando cambian empleados, asistencia o permisos. */
let scheduled=false;
document.addEventListener("peopledesk:data",()=>{
 if(scheduled)return;scheduled=true;
 Promise.resolve().then(()=>{scheduled=false;renderDashboard()});
});
renderDashboard();
