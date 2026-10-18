/* Permisos personales de empleados. */
import {$,state,can} from "./state.js";
import {logAudit} from "./audit.js";
import {db,collection,getDocs,addDoc,updateDoc,doc,serverTimestamp} from "./firebase.js";
import {getDateKey} from "./time.js";

const fmtDate=d=>String(d||"").split("-").reverse().join("/");
const permCoversDate=(p,date)=>p.dateFrom<=date&&p.dateTo>=date;
export function getActivePermission(empId,date=getDateKey()){return state.permissions.find(p=>p.employeeId===empId&&p.status==="Aprobado"&&permCoversDate(p,date))||null}
let permAt=0,permUser=null;
export function loadPermissionsIfStale(ms=15000){return state.currentUser&&permUser===state.currentUser.uid&&Date.now()-permAt<ms?Promise.resolve():loadPermissions()}
export async function loadPermissions(){
 if(!state.currentUser)return;
 try{const snap=await getDocs(collection(db,"permissions"));permAt=Date.now();permUser=state.currentUser&&state.currentUser.uid;state.permissions=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>String(b.dateFrom).localeCompare(String(a.dateFrom)))}
 catch(err){console.error("Error cargando permisos:",err);$("permMessage").textContent="No se pudieron cargar los permisos. Revisa las reglas de Firestore (colección permissions)."}
 renderPermissions();updatePermissionStats();
}
export function updatePermissionStats(){
 const today=getDateKey(),act=state.permissions.filter(p=>p.status==="Aprobado"&&permCoversDate(p,today)),n=new Set(act.map(p=>p.employeeId)).size;
 $("permTodayCount").textContent=n;$("permStatToday").textContent=n;$("permStatPending").textContent=state.permissions.filter(p=>p.status==="Pendiente").length;$("permStatTotal").textContent=state.permissions.length;
 const list=$("permTodayList");list.replaceChildren();
 act.forEach(p=>{const s=document.createElement("span");s.className="perm-chip";s.textContent=`${p.name} · ${p.type}${p.partial?` (${p.startTime}–${p.endTime})`:""}`;list.appendChild(s)});
 $("permTodayEmpty").style.display=act.length?"none":"block";
 document.dispatchEvent(new Event("peopledesk:data"));
}
export function renderPermissions(){
 const tbody=$("permList"),term=String($("permSearch").value||"").trim().toLocaleLowerCase("es"),f=$("permFilter").value,today=getDateKey();
 const visible=state.permissions.filter(p=>{
  if(f==="hoy"&&!(p.status==="Aprobado"&&permCoversDate(p,today)))return false;
  if(f!=="todos"&&f!=="hoy"&&p.status!==f)return false;
  return !term||[p.name,p.code,p.reason,p.type].some(v=>String(v||"").toLocaleLowerCase("es").includes(term));
 });
 tbody.replaceChildren();
 visible.forEach(p=>{
  const tr=document.createElement("tr");
  const cells=[`${p.name||""} (${p.code||""})`,p.type,p.dateFrom===p.dateTo?fmtDate(p.dateFrom):`${fmtDate(p.dateFrom)} → ${fmtDate(p.dateTo)}`,p.partial?`${p.startTime}–${p.endTime}`:"Día completo",p.reason];
  cells.forEach(v=>{const td=document.createElement("td");td.textContent=v||"";tr.appendChild(td)});
  const tdS=document.createElement("td"),b=document.createElement("span");b.className="badge"+(p.status==="Pendiente"?" warn":p.status==="Rechazado"?" late":p.status==="Cancelado"?" neutral":"");b.textContent=p.status||"";tdS.appendChild(b);tr.appendChild(tdS);
  const tdA=document.createElement("td");
  const mk=(label,status,cls="")=>{const btn=document.createElement("button");btn.type="button";btn.className="mini "+cls;btn.textContent=label;btn.addEventListener("click",()=>setPermissionStatus(p.id,status));tdA.appendChild(btn)};
  if(can.hr()){if(p.status==="Pendiente"){mk("Aprobar","Aprobado");mk("Rechazar","Rechazado","danger")}
  if(p.status==="Aprobado"||p.status==="Pendiente")mk("Cancelar","Cancelado","secondary")}
  tr.appendChild(tdA);tbody.appendChild(tr);
 });
 $("permEmpty").style.display=visible.length?"none":"block";
 $("permEmpty").textContent=state.permissions.length?"No hay permisos para ese filtro.":"Todavía no hay permisos registrados.";
}
async function setPermissionStatus(id,status){
 if(!state.currentUser)return;
 try{await updateDoc(doc(db,"permissions",id),{status,updatedBy:state.currentUser.email||"",updatedAt:serverTimestamp()});const pm=state.permissions.find(x=>x.id===id);await logAudit("Permiso "+status.toLowerCase(),pm?pm.code:id,pm?`${pm.name} · ${pm.type} · ${pm.dateFrom}→${pm.dateTo}`:"");await loadPermissions()}
 catch(err){console.error(err);$("permMessage").textContent="No se pudo actualizar el permiso. Revisa Firestore."}
}
function resetPermDates(){const t=getDateKey();$("permFrom").value=t;$("permTo").value=t;$("permTimes").hidden=true}
$("permDuration").addEventListener("change",()=>{$("permTimes").hidden=$("permDuration").value!=="parcial"});
$("permSearch").addEventListener("input",renderPermissions);$("permFilter").addEventListener("change",renderPermissions);
$("permFrom").addEventListener("change",()=>{if(!$("permTo").value||$("permTo").value<$("permFrom").value)$("permTo").value=$("permFrom").value});
$("permissionForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!state.currentUser)return;
 const emp=state.employees.find(x=>x.id===$("permEmployee").value),from=$("permFrom").value,to=$("permTo").value||from,partial=$("permDuration").value==="parcial",start=$("permStart").value,end=$("permEnd").value,msg=$("permMessage");
 if(!emp){msg.textContent="Selecciona un empleado.";return}
 if(!from){msg.textContent="Indica la fecha de inicio.";return}
 if(to<from){msg.textContent="La fecha final no puede ser anterior a la inicial.";return}
 if(partial&&(!start||!end||end<=start)){msg.textContent="Indica un horario válido: la hora de fin debe ser posterior a la de inicio.";return}
 const clash=state.permissions.find(p=>p.employeeId===emp.id&&(p.status==="Aprobado"||p.status==="Pendiente")&&p.dateFrom<=to&&p.dateTo>=from&&(!p.partial||!partial));
 if(clash){msg.textContent=`${emp.name} ya tiene un permiso ${clash.status.toLowerCase()} que se cruza con esas fechas.`;return}
 $("permButton").disabled=true;msg.textContent="Guardando permiso...";
 try{
  await addDoc(collection(db,"permissions"),{employeeId:emp.id,code:emp.code,name:emp.name,position:emp.position,department:emp.department,type:$("permType").value,dateFrom:from,dateTo:to,partial,startTime:partial?start:"",endTime:partial?end:"",reason:$("permReason").value.trim(),status:$("permStatus").value,registeredBy:state.currentUser.email||"",createdAt:serverTimestamp()});
  await logAudit("Permiso registrado",emp.code,`${emp.name} · ${$("permType").value} · ${from}→${to} · ${$("permStatus").value}`);$("permissionForm").reset();resetPermDates();await loadPermissions();msg.textContent="Permiso guardado correctamente.";
 }catch(err){console.error(err);msg.textContent="No se pudo guardar el permiso. Revisa las reglas de Firestore (colección permissions)."}
 finally{$("permButton").disabled=false}
});
resetPermDates();
