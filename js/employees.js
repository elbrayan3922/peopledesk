/* Empleados: alta, directorio y sincronización del token QR (colección qrTokens). */
import {$,state} from "./state.js";
import {db,collection,getDocs,addDoc,updateDoc,doc,setDoc,serverTimestamp} from "./firebase.js";

/* Copia pública mínima del empleado, indexada por su token QR (la terminal solo puede leer un documento por token). */
async function syncQrToken(emp){await setDoc(doc(db,"qrTokens",emp.qrToken),{employeeId:emp.id,code:emp.code||"",name:emp.name||"",position:emp.position||"",department:emp.department||"",status:emp.status||"Activo"});await updateDoc(doc(db,"employees",emp.id),{qrSynced:true})}
function createToken(){if(crypto.randomUUID)return crypto.randomUUID();const b=new Uint8Array(24);crypto.getRandomValues(b);return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("")}
export async function loadEmployees(){if(!state.currentUser)return;const snap=await getDocs(collection(db,"employees")),loaded=[];for(const item of snap.docs){const data=item.data();if(!data.qrToken){data.qrToken=createToken();await updateDoc(doc(db,"employees",item.id),{qrToken:data.qrToken})}if(!data.qrSynced){try{await syncQrToken({id:item.id,...data});data.qrSynced=true}catch(e){console.warn("No se pudo habilitar el QR de "+data.code+" en la terminal.",e)}}loaded.push({id:item.id,...data})}state.employees=loaded;renderEmployees()}
export function renderEmployees(){$("employeeList").replaceChildren();state.employees.forEach(emp=>{const tr=document.createElement("tr");[emp.code,emp.name,emp.position,emp.department].forEach(v=>{const td=document.createElement("td");td.textContent=v||"";tr.appendChild(td)});const td=document.createElement("td"),badge=document.createElement("span");badge.className="badge";badge.textContent=emp.status||"Activo";td.appendChild(badge);tr.appendChild(td);$("employeeList").appendChild(tr)});$("total").textContent=state.employees.length;$("active").textContent=state.employees.filter(e=>e.status!=="Inactivo").length;$("empty").style.display=state.employees.length?"none":"block";fillEmployeeSelects()}
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
$("employeeForm").addEventListener("submit",async e=>{e.preventDefault();if(!state.currentUser)return;const name=$("name").value.trim(),position=$("position").value.trim(),department=$("department").value.trim(),code=$("code").value.trim();if(state.employees.some(x=>(x.code||"").toLowerCase()===code.toLowerCase())){$("employeeMessage").textContent="Ese código ya está registrado.";return}$("registerButton").disabled=true;$("employeeMessage").textContent="Guardando empleado...";try{const qrToken=createToken(),ref=await addDoc(collection(db,"employees"),{name,position,department,code,status:"Activo",qrToken,createdAt:serverTimestamp()});await syncQrToken({id:ref.id,name,position,department,code,status:"Activo",qrToken});$("employeeForm").reset();$("department").dispatchEvent(new Event("change"));await loadEmployees();$("employeeMessage").textContent="Empleado registrado correctamente."}catch(err){console.error(err);$("employeeMessage").textContent="No se pudo guardar el empleado. Revisa Firestore."}finally{$("registerButton").disabled=false}});

export function fillEmployeeSelects(){
 const active=state.employees.filter(e=>e.status!=="Inactivo").slice().sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"es"));
 [["manualEmployee",false],["permEmployee",false],["bioEmployee",true]].forEach(([id,bio])=>{
  const sel=$(id),prev=sel.value;sel.replaceChildren();
  const ph=document.createElement("option");ph.value="";ph.textContent=active.length?"Selecciona un empleado":"No hay empleados activos";sel.appendChild(ph);
  active.forEach(e=>{const o=document.createElement("option");o.value=e.id;o.textContent=`${e.code} · ${e.name}${bio&&e.biometricId?" ✓":""}`;sel.appendChild(o)});
  if(active.some(e=>e.id===prev))sel.value=prev;
 });
}
