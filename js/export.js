/* Exportación a Excel (.xlsx) con SheetJS. Solo administrador: los botones viven en el panel. */
import {$,state} from "./state.js";
import {db,collection,getDocs,query,where} from "./firebase.js";
import {getDateKey} from "./time.js";
import {loadPermissions} from "./permissions.js";

const METHOD={qr:"QR",manual:"Manual",biometrico:"Biométrica"};
const methodOf=r=>METHOD[r&&r.method]||"QR";
const fmtDate=d=>String(d||"").split("-").reverse().join("/");
const permLabel=p=>p?`${p.type}${p.partial?` (${p.startTime}–${p.endTime})`:""}`:"";

function makeSheet(rows,widths){
 const ws=XLSX.utils.json_to_sheet(rows);
 ws["!cols"]=widths.map(w=>({wch:w}));
 return ws;
}
function libraryReady(msg){
 if(window.XLSX)return true;
 msg.textContent="No se pudo cargar la librería de Excel. Recarga la página e inténtalo de nuevo.";
 return false;
}

/* ===== Asistencia por rango de fechas ===== */
async function exportAttendance(){
 if(!state.currentUser)return;
 const msg=$("exportAttMessage"),btn=$("exportAttButton"),from=$("exportAttFrom").value,to=$("exportAttTo").value;
 if(!from||!to){msg.textContent="Indica las dos fechas.";return}
 if(to<from){msg.textContent="La fecha final no puede ser anterior a la inicial.";return}
 if((new Date(to)-new Date(from))/86400000>366){msg.textContent="El rango máximo es de un año.";return}
 if(!libraryReady(msg))return;
 btn.disabled=true;msg.textContent="Preparando archivo...";
 try{
  const [snap]=await Promise.all([getDocs(query(collection(db,"attendance"),where("date",">=",from),where("date","<=",to))),loadPermissions()]);
  const recs=snap.docs.map(d=>d.data());
  if(!recs.length){msg.textContent="No hay asistencias registradas en ese rango.";return}

  // Une entrada y salida de cada empleado por día
  const days=new Map();
  recs.forEach(r=>{
   const k=`${r.employeeId}|${r.date}`;
   if(!days.has(k))days.set(k,{employeeId:r.employeeId,date:r.date,code:r.code,name:r.name,position:r.position,department:r.department,notes:[]});
   const g=days.get(k),isExit=r.type==="salida";
   if(isExit){g.exitTime=r.time;g.exitMethod=methodOf(r)}else{g.entryTime=r.time;g.punctuality=r.punctuality;g.entryMethod=methodOf(r)}
   if(r.method==="manual")g.notes.push(`${isExit?"Salida":"Entrada"} manual por ${r.registeredBy||"—"}: ${r.reason||"sin motivo"}`);
  });
  const grouped=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)||String(a.name).localeCompare(String(b.name),"es"));
  const permOf=g=>state.permissions.find(p=>p.employeeId===g.employeeId&&p.status==="Aprobado"&&p.dateFrom<=g.date&&p.dateTo>=g.date);

  const attendanceRows=grouped.map(g=>({"Fecha":fmtDate(g.date),"Código":g.code,"Nombre":g.name,"Puesto":g.position,"Departamento":g.department,"Entrada":g.entryTime||"—","Puntualidad":g.punctuality||"—","Método entrada":g.entryMethod||"—","Salida":g.exitTime||"—","Método salida":g.exitMethod||"—","Permiso":permLabel(permOf(g)),"Observaciones":g.notes.join(" | ")}));

  // Resumen por empleado
  const sum=new Map();
  grouped.forEach(g=>{
   if(!sum.has(g.employeeId))sum.set(g.employeeId,{"Código":g.code,"Nombre":g.name,"Puesto":g.position,"Departamento":g.department,"Días con registro":0,"A tiempo":0,"Margen final":0,"Tardíos":0,"Sin entrada":0,"Sin salida":0,"Registros manuales":0,"Días con permiso":0});
   const s=sum.get(g.employeeId);
   s["Días con registro"]++;
   if(!g.entryTime)s["Sin entrada"]++;
   else if(g.punctuality==="Tardío")s["Tardíos"]++;
   else if(g.punctuality==="Margen final")s["Margen final"]++;
   else s["A tiempo"]++;
   if(!g.exitTime)s["Sin salida"]++;
   s["Registros manuales"]+=g.notes.length;
   if(permOf(g))s["Días con permiso"]++;
  });
  const summaryRows=[...sum.values()].sort((a,b)=>String(a["Nombre"]).localeCompare(String(b["Nombre"]),"es"));

  // Detalle de cada marca (auditoría)
  const detailRows=recs.slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.name).localeCompare(String(b.name),"es")||(a.type==="salida")-(b.type==="salida")).map(r=>({"Fecha":fmtDate(r.date),"Hora":r.time,"Tipo":r.type==="salida"?"Salida":"Entrada","Código":r.code,"Nombre":r.name,"Método":methodOf(r),"Registrado por":r.registeredBy||"","Motivo":r.reason||""}));

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,makeSheet(attendanceRows,[11,11,26,24,24,13,13,15,13,15,22,50]),"Asistencia");
  XLSX.utils.book_append_sheet(wb,makeSheet(summaryRows,[11,26,24,24,18,10,13,10,12,11,18,16]),"Resumen");
  XLSX.utils.book_append_sheet(wb,makeSheet(detailRows,[11,13,10,11,26,12,28,40]),"Detalle");
  XLSX.writeFile(wb,`asistencia_${from}_a_${to}.xlsx`);
  msg.textContent=`Archivo generado: ${grouped.length} día(s) de empleado en el rango.`;
  console.info(`[Excel] Asistencia exportada ${from} → ${to} (${recs.length} marcas).`);
 }catch(err){
  console.error("Error al exportar asistencia:",err);
  msg.textContent="No se pudo exportar la asistencia. Revisa tu sesión y las reglas de Firestore.";
 }finally{btn.disabled=false}
}

/* ===== Permisos ===== */
async function exportPermissions(){
 if(!state.currentUser)return;
 const msg=$("permMessage");
 if(!libraryReady(msg))return;
 $("exportPermButton").disabled=true;
 try{
  await loadPermissions();
  if(!state.permissions.length){msg.textContent="No hay permisos para exportar.";return}
  const rows=state.permissions.map(p=>({"Código":p.code,"Nombre":p.name,"Puesto":p.position,"Departamento":p.department,"Tipo":p.type,"Desde":fmtDate(p.dateFrom),"Hasta":fmtDate(p.dateTo),"Horario":p.partial?`${p.startTime}–${p.endTime}`:"Día completo","Motivo":p.reason,"Estado":p.status,"Registrado por":p.registeredBy||""}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,makeSheet(rows,[11,26,24,24,12,11,11,14,40,12,28]),"Permisos");
  XLSX.writeFile(wb,`permisos_${getDateKey()}.xlsx`);
  msg.textContent=`Archivo generado con ${rows.length} permiso(s).`;
 }catch(err){
  console.error("Error al exportar permisos:",err);
  msg.textContent="No se pudieron exportar los permisos.";
 }finally{$("exportPermButton").disabled=false}
}

/* ===== Empleados (no incluye el token QR, que es sensible) ===== */
function exportEmployees(){
 if(!state.currentUser)return;
 const msg=$("employeeMessage");
 if(!libraryReady(msg))return;
 if(!state.employees.length){msg.textContent="No hay empleados para exportar.";return}
 const rows=state.employees.slice().sort((a,b)=>String(a.code).localeCompare(String(b.code),"es",{numeric:true})).map(e=>({"Código":e.code,"Nombre":e.name,"Puesto":e.position,"Departamento":e.department,"Estado":e.status||"Activo","Biometría registrada":e.biometricId?"Sí":"No"}));
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,makeSheet(rows,[11,28,24,24,10,20]),"Empleados");
 XLSX.writeFile(wb,`empleados_${getDateKey()}.xlsx`);
 msg.textContent=`Archivo generado con ${rows.length} empleado(s).`;
}

$("exportAttButton").addEventListener("click",exportAttendance);
$("exportPermButton").addEventListener("click",exportPermissions);
$("exportEmpButton").addEventListener("click",exportEmployees);

// Rango por defecto: del primer día del mes a hoy
$("exportAttFrom").value=getDateKey().slice(0,8)+"01";
$("exportAttTo").value=getDateKey();
