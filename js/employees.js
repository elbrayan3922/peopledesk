/* Empleados: alta, directorio y sincronización del token QR (colección qrTokens). */
import {$,state,can,el} from "./state.js";
import {db,collection,getDocs,addDoc,updateDoc,doc,setDoc,serverTimestamp} from "./firebase.js";
import {getShifts,getShiftFor,shiftById,getDefaultShift} from "./schedule.js";
import {fmtHM} from "./shift-core.js";
import {logAudit} from "./audit.js";
import {hasConsent,revokeConsent} from "./consent.js";

/* Copia pública mínima del empleado, indexada por su token QR (la terminal solo puede leer un documento por token). */
async function syncQrToken(emp){await setDoc(doc(db,"qrTokens",emp.qrToken),{employeeId:emp.id,code:emp.code||"",name:emp.name||"",position:emp.position||"",department:emp.department||"",status:emp.status||"Activo",shiftId:emp.shiftId||""});await updateDoc(doc(db,"employees",emp.id),{qrSynced:true})}
function createToken(){if(crypto.randomUUID)return crypto.randomUUID();const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("")}
export async function loadEmployees(){if(!state.currentUser)return;const snap=await getDocs(collection(db,"employees")),loaded=[];for(const item of snap.docs){const data=item.data();if(!data.qrToken&&can.hr()){data.qrToken=createToken();await updateDoc(doc(db,"employees",item.id),{qrToken:data.qrToken})}if(!data.qrSynced&&data.qrToken&&can.hr()){try{await syncQrToken({id:item.id,...data});data.qrSynced=true}catch(e){console.warn("No se pudo habilitar el QR de "+data.code+" en la terminal.",e)}}loaded.push({id:item.id,...data})}state.employees=loaded;renderEmployees()}
export function renderEmployees(){$("employeeList").replaceChildren();state.employees.forEach(emp=>{const tr=document.createElement("tr");[emp.code,emp.name,emp.position,emp.department].forEach(v=>{const td=document.createElement("td");td.textContent=v||"";tr.appendChild(td)});
 const sh=getShiftFor(emp),tdS=el("td",null,emp.shiftId&&shiftById(emp.shiftId)?sh.name:`${sh.name} (predet.)`);tdS.title=`${fmtHM(sh.entryLimit)} – ${fmtHM(sh.exitTime)}`;tr.appendChild(tdS);
 const td=document.createElement("td"),badge=document.createElement("span");badge.className="badge"+(emp.status==="Inactivo"?" neutral":"");badge.textContent=emp.status||"Activo";td.appendChild(badge);tr.appendChild(td);
 const tdB=el("td"),has=!!(emp.biometricId||Array.isArray(emp.faceDescriptor)),ok=hasConsent(emp,"facial")||hasConsent(emp,"huella");
 tdB.appendChild(el("span","badge "+(!has?"neutral":ok?"":"late"),!has?"Sin registrar":ok?"Con consentimiento":"Sin consentimiento"));tr.appendChild(tdB);
 const tdA=el("td");if(can.hr()){const b=el("button","mini secondary","Editar");b.type="button";b.addEventListener("click",()=>openEmployeeDialog(emp));tdA.appendChild(b)}tr.appendChild(tdA);
 $("employeeList").appendChild(tr)});$("total").textContent=state.employees.length;$("active").textContent=state.employees.filter(e=>e.status!=="Inactivo").length;$("empty").style.display=state.employees.length?"none":"block";fillEmployeeSelects();document.dispatchEvent(new Event("peopledesk:data"))}
const departmentPositions={
 "Gerencia General":["Gerente General"],
 "Recursos Humanos":["Gerente de RRHH","Asistente de RRHH"],
 "Finanzas y Contabilidad":["Gerente de Finanzas","Asistente de Finanzas","Bancos"],
 "Ventas":["Gerente de Ventas","Dependiente de Ventas"],
 "Compras e Inventario":["Gerente de Compras","Inventarios"],
 "Caja":["Cajero"],
 "Proveedores Externos":["Proveedor"]
};
$("department").addEventListener("change",()=>{
 const department=$("department").value,position=$("position");
 position.replaceChildren();
 const placeholder=document.createElement("option");
 placeholder.value="";
 placeholder.textContent=department?"Selecciona un puesto":"Primero selecciona un departamento";
 position.appendChild(placeholder);
 (departmentPositions[department]||[]).forEach(role=>{
  const option=document.createElement("option");option.value=role;option.textContent=role;position.appendChild(option);
 });
 position.disabled=!department;
});
$("employeeForm").addEventListener("submit",async e=>{e.preventDefault();if(!state.currentUser)return;const name=$("name").value.trim(),position=$("position").value.trim(),department=$("department").value.trim(),code=$("code").value.trim();if(state.employees.some(x=>(x.code||"").toLowerCase()===code.toLowerCase())){$("employeeMessage").textContent="Ese código ya está registrado.";return}$("registerButton").disabled=true;$("employeeMessage").textContent="Guardando empleado...";try{const shiftId=$("shiftId").value,salary=Number($("salary").value)>0?Math.round(Number($("salary").value)*100)/100:null,qrToken=createToken(),ref=await addDoc(collection(db,"employees"),{name,position,department,code,status:"Activo",qrToken,shiftId,salary,createdAt:serverTimestamp()});await syncQrToken({id:ref.id,name,position,department,code,status:"Activo",qrToken,shiftId});await logAudit("Empleado registrado",code,`${name} · ${department} · ${position}`);$("employeeForm").reset();$("shiftId").value="";$("department").dispatchEvent(new Event("change"));await loadEmployees();$("employeeMessage").textContent="Empleado registrado correctamente."}catch(err){console.error(err);$("employeeMessage").textContent="No se pudo guardar el empleado. Revisa Firestore."}finally{$("registerButton").disabled=false}});

export function fillEmployeeSelects(){
 const active=state.employees.filter(e=>e.status!=="Inactivo").slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"es"));
 [["manualEmployee",()=>false],["permEmployee",()=>false],["bioEmployee",e=>!!e.biometricId],["faceEmployee",e=>Array.isArray(e.faceDescriptor)]].forEach(([id,hasId])=>{
  const sel=$(id),prev=sel.value;sel.replaceChildren();
  const ph=document.createElement("option");ph.value="";ph.textContent=active.length?"Selecciona un empleado":"No hay empleados activos";sel.appendChild(ph);
  active.forEach(e=>{const o=document.createElement("option");o.value=e.id;o.textContent=`${e.code} · ${e.name}${hasId(e)?" ✓":""}`;sel.appendChild(o)});
  if(active.some(e=>e.id===prev))sel.value=prev;
 });
}

/* ===== Turnos en los selectores ===== */
export function fillShiftSelects(){
 [["shiftId","Turno predeterminado"],["empShift","Turno predeterminado"]].forEach(([id,ph])=>{
  const sel=$(id);if(!sel)return;const prev=sel.value;sel.replaceChildren();
  const def=getDefaultShift();sel.appendChild(new Option(`${ph} (${def.name})`,""));
  getShifts().forEach(s=>sel.appendChild(new Option(`${s.name} · ${fmtHM(s.entryLimit)}–${fmtHM(s.exitTime)}`,s.id)));
  if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 });
}
document.addEventListener("peopledesk:schedule",()=>{fillShiftSelects();if(state.employees.length)renderEmployees()});
fillShiftSelects();

/* ===== Edición de empleado: turno, salario y estado. El token QR no se toca JAMÁS. ===== */
let editing=null;
function openEmployeeDialog(emp){
 editing=emp;$("empDialogName").textContent=`${emp.code} · ${emp.name}`;fillShiftSelects();
 $("empShift").value=emp.shiftId&&shiftById(emp.shiftId)?emp.shiftId:"";$("empSalary").value=emp.salary>0?emp.salary:"";$("empStatus").value=emp.status||"Activo";
 const has=!!(emp.biometricId||Array.isArray(emp.faceDescriptor));$("empRevoke").hidden=!has&&!state.consents[emp.id];
 $("empBioInfo").textContent=has?(hasConsent(emp,"facial")||hasConsent(emp,"huella")?"Tiene datos biométricos con consentimiento registrado.":"Tiene datos biométricos SIN consentimiento registrado: conviene revocarlos y volver a registrarlos con consentimiento."):"No tiene datos biométricos registrados.";
 $("empMessage").textContent="";$("empDialog").showModal();
}
$("empCancel").addEventListener("click",()=>$("empDialog").close());
$("empSave").addEventListener("click",async()=>{
 if(!editing||!can.hr())return;const emp=editing,shiftId=$("empShift").value,sal=Number($("empSalary").value),salary=sal>0?Math.round(sal*100)/100:null,status=$("empStatus").value;
 $("empSave").disabled=true;$("empMessage").textContent="Guardando...";
 try{
  await updateDoc(doc(db,"employees",emp.id),{shiftId,salary,status,updatedAt:serverTimestamp()});   // sin qrToken: la tarjeta sigue igual
  if(emp.qrToken)await syncQrToken({...emp,shiftId,status});
  const ch=[];if((emp.shiftId||"")!==shiftId)ch.push(`turno: ${(shiftById(emp.shiftId)||{name:"predet."}).name} → ${(shiftById(shiftId)||{name:"predet."}).name}`);if((emp.salary||null)!==salary)ch.push("salario modificado");if((emp.status||"Activo")!==status)ch.push(`estado: ${emp.status||"Activo"} → ${status}`);
  if(ch.length)await logAudit("Empleado editado",emp.code,ch.join(" · "));
  $("empDialog").close();await loadEmployees();$("employeeMessage").textContent=`Datos de ${emp.name} actualizados.`;
 }catch(err){console.error(err);$("empMessage").textContent="No se pudo guardar. Revisa tus permisos y las reglas de Firestore."}
 finally{$("empSave").disabled=false}
});
$("empRevoke").addEventListener("click",async()=>{
 if(!editing||!can.hr())return;if(!confirm(`¿Revocar el consentimiento de ${editing.name} y borrar sus datos biométricos? Podrá marcar con su QR.`))return;
 $("empMessage").textContent="Revocando...";
 try{await revokeConsent(editing);$("empDialog").close();await loadEmployees();$("employeeMessage").textContent="Consentimiento revocado y datos biométricos eliminados."}
 catch(err){console.error(err);$("empMessage").textContent="No se pudo revocar. Revisa tus permisos."}
});
