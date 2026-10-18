/* Salarios: viven en su propia colección (salaries/{empleado}), que solo leen RR. HH. y el administrador.
 * El rol «solo lectura» ya no ve sueldos. Cada cambio guarda el valor anterior (historial) y queda en la bitácora con «antes → después». */
import {$,state,can,el} from "./state.js";
import {db,collection,getDocs,doc,setDoc,updateDoc,serverTimestamp} from "./firebase.js";
import {logAudit} from "./audit.js";

export const money=n=>"$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
/* Salario mensual del empleado, o null si no tiene (entonces la planilla usa el de referencia). */
export function getSalary(emp){const s=state.salaries[emp.id];if(s&&s.amount>0)return s.amount;return emp.salary>0?emp.salary:null}

export async function loadSalaries(force=false){
 const uid=state.currentUser&&state.currentUser.uid;
 if(!can.hr()){state.salaries={};return}
 if(!force&&state.salariesUser===uid)return;
 try{const snap=await getDocs(collection(db,"salaries"));state.salaries=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));state.salariesUser=uid}
 catch(e){state.salaries={};console.warn("[Salarios] No se pudieron cargar:",e&&e.code||e)}
}
/* Versión 4.1.0 guardaba el sueldo dentro del empleado: se traslada una sola vez a la colección protegida. */
export async function migrateLegacySalaries(list){
 if(!can.hr())return;let n=0;
 for(const e of list){
  if(!(e.salary>0)||(state.salaries[e.id]&&state.salaries[e.id].amount>0))continue;
  try{
   const rec={employeeId:e.id,amount:e.salary,history:[],updatedAt:serverTimestamp(),updatedBy:"migración"};
   await setDoc(doc(db,"salaries",e.id),rec);await updateDoc(doc(db,"employees",e.id),{salary:null});
   state.salaries[e.id]={...rec,updatedAt:new Date()};e.salary=null;n++;
  }catch(err){console.warn("[Salarios] No se pudo migrar "+e.code,err&&err.code||err)}
 }
 if(n)await logAudit("Salarios trasladados a la colección protegida","salaries",`${n} empleado(s)`);
}
/* Guarda el salario (null = sin salario propio). Devuelve true si cambió algo. */
export async function saveSalary(emp,amount){
 if(!can.hr())throw new Error("sin-permiso");
 const prev=state.salaries[emp.id],before=prev&&prev.amount>0?prev.amount:0,next=amount>0?Math.round(amount*100)/100:0;
 if(before===next)return false;
 const history=[...(prev&&prev.history||[]),...(before?[{amount:before,until:Date.now(),by:state.currentUser.email||""}]:[])].slice(-20);
 const rec={employeeId:emp.id,amount:next,history,updatedAt:serverTimestamp(),updatedBy:state.currentUser.email||""};
 await setDoc(doc(db,"salaries",emp.id),rec);
 state.salaries[emp.id]={...rec,updatedAt:new Date()};
 await logAudit("Salario modificado",emp.code||emp.id,`${emp.name||""}: ${before?money(before):"sin salario"} → ${next?money(next):"sin salario"}`);
 return true;
}

/* ===== Edición de salarios de todos los empleados ===== */
let rows=[];
const ref=()=>state.config&&state.config.defaultSalary||0;
function renderRows(){
 const body=$("salaryRows");body.replaceChildren();rows=[];
 state.employees.filter(e=>e.status!=="Inactivo").sort((a,b)=>String(a.name).localeCompare(String(b.name),"es")).forEach(e=>{
  const tr=el("tr"),inp=el("input");inp.type="number";inp.min="0";inp.step="0.01";inp.placeholder=`Referencia ${money(ref())}`;inp.value=getSalary(e)||"";
  [e.code,e.name,e.position].forEach(v=>tr.appendChild(el("td",null,v||"")));const td=el("td");td.appendChild(inp);tr.appendChild(td);body.appendChild(tr);rows.push({e,inp,start:getSalary(e)||0});
 });
 $("salaryNote").textContent=rows.length?`${rows.filter(r=>!r.start).length} sin salario propio (se usa la referencia ${money(ref())}).`:"No hay empleados activos.";
}
export function openSalaryDialog(){
 if(!can.hr())return;renderRows();$("salaryMessage").textContent="";$("salaryBulkAmount").value="";$("salaryDialog").showModal();
}
$("salaryOpen").addEventListener("click",openSalaryDialog);
$("salaryCancel").addEventListener("click",()=>$("salaryDialog").close());
$("salaryBulkApply").addEventListener("click",()=>{
 const v=Number($("salaryBulkAmount").value);if(!(v>0)){$("salaryMessage").textContent="Escribe un monto mayor que cero.";return}
 const all=$("salaryBulkScope").value==="todos";let n=0;
 rows.forEach(r=>{if(all||!Number(r.inp.value)){r.inp.value=v;n++}});$("salaryMessage").textContent=`${money(v)} puesto en ${n} fila(s). Revisa y pulsa «Guardar cambios».`;
});
$("salarySave").addEventListener("click",async()=>{
 const changed=rows.filter(r=>(Number(r.inp.value)>0?Math.round(Number(r.inp.value)*100)/100:0)!==r.start);
 if(!changed.length){$("salaryMessage").textContent="No hay cambios que guardar.";return}
 $("salarySave").disabled=true;let done=0;
 try{for(const r of changed){await saveSalary(r.e,Number(r.inp.value)||null);done++;$("salaryMessage").textContent=`Guardando... ${done} de ${changed.length}`}
  $("salaryMessage").textContent=`${done} salario(s) actualizado(s). Cada cambio quedó en la bitácora.`;renderRows();document.dispatchEvent(new Event("peopledesk:data"));$("employeeMessage").textContent=`${done} salario(s) actualizado(s).`;
  document.dispatchEvent(new Event("peopledesk:salaries"));
 }catch(err){console.error(err);$("salaryMessage").textContent=`Se guardaron ${done} de ${changed.length}. Falló uno (${err&&err.code||err.message}). Revisa tu rol y las reglas de Firestore.`}
 finally{$("salarySave").disabled=false}
});
