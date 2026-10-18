/* Roles configurables desde el panel. Los correos escritos en firestore.rules (isSuper) siempre son administradores y no se pueden bloquear.
 * Los demás se gestionan aquí: staff/{correo} = {role: admin | rrhh | consulta, active}. */
import {$,state,can,el} from "./state.js";
import {db,collection,getDocs,getDoc,doc,setDoc,deleteDoc,serverTimestamp} from "./firebase.js";
import {logAudit} from "./audit.js";

export const ROLES={admin:"Administrador",rrhh:"Recursos Humanos",consulta:"Solo lectura"};
export const ROLE_HELP={admin:"Todo: empleados, horarios, planilla, roles, auditoría, respaldo y privacidad.",rrhh:"Empleados, permisos, asistencia manual, horarios y planilla. No gestiona roles, respaldo ni auditoría.",consulta:"Solo ve información. No registra ni modifica nada."};

/* Devuelve el rol de la cuenta o null si no tiene acceso. */
export async function resolveRole(user){
 const email=String(user.email||"").toLowerCase();
 try{const s=await getDoc(doc(db,"staff",email));if(s.exists()){const d=s.data();if(d.active!==false&&ROLES[d.role])return d.role}}
 catch(e){console.warn("[Roles] No se pudo leer el rol propio:",e&&e.code||e)}
 try{await getDocs(collection(db,"staff"));   // solo un administrador puede listar: así se reconoce al principal
  try{await setDoc(doc(db,"staff",email),{email,role:"admin",active:true,main:true,addedBy:"sistema",createdAt:serverTimestamp()},{merge:true})}catch(e){}
  return "admin";
 }catch(e){}
 return null;
}
export function applyRole(role){
 state.role=role;
 ["admin","rrhh","consulta"].forEach(r=>document.body.classList.toggle("role-"+r,r===role));
 if($("roleBadge"))$("roleBadge").textContent=role?ROLES[role]:"";
}

/* ===== Pantalla de roles ===== */
let staff=[];
export async function loadStaff(){
 if(!can.admin())return;const msg=$("staffMessage");
 try{const snap=await getDocs(collection(db,"staff"));staff=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.email).localeCompare(String(b.email)));renderStaff();msg.textContent=""}
 catch(e){console.error(e);msg.textContent="No se pudo cargar la lista de accesos."}
}
function renderStaff(){
 const body=$("staffList");body.replaceChildren();const me=String(state.currentUser&&state.currentUser.email||"").toLowerCase();
 staff.forEach(s=>{
  const tr=el("tr"),mine=s.id===me;
  tr.appendChild(el("td",null,s.email||s.id+(mine?" (tú)":"")));if(mine&&!String(s.email||"").includes("(tú)"))tr.firstChild.textContent=(s.email||s.id)+" (tú)";
  const tdR=el("td"),sel=el("select");Object.entries(ROLES).forEach(([k,v])=>sel.appendChild(new Option(v,k)));sel.value=s.role;sel.disabled=mine||s.main;
  sel.addEventListener("change",async()=>{await save(s,{role:sel.value},`Rol de ${s.id}: ${ROLES[s.role]} → ${ROLES[sel.value]}`,"Rol modificado")});tdR.appendChild(sel);tr.appendChild(tdR);
  const tdA=el("td"),lb=el("label","day-chip"),cb=el("input");cb.type="checkbox";cb.checked=s.active!==false;cb.disabled=mine||s.main;
  cb.addEventListener("change",async()=>{await save(s,{active:cb.checked},`${s.id}: acceso ${cb.checked?"activado":"desactivado"}`,cb.checked?"Acceso activado":"Acceso desactivado")});lb.append(cb,document.createTextNode(" Activo"));tdA.appendChild(lb);tr.appendChild(tdA);
  tr.appendChild(el("td",null,s.addedBy||""));
  const tdX=el("td");if(!mine&&!s.main){const x=el("button","mini danger","Quitar");x.type="button";x.addEventListener("click",async()=>{
   if(!confirm(`¿Quitar el acceso de ${s.id}?`))return;
   try{await deleteDoc(doc(db,"staff",s.id));await logAudit("Acceso eliminado",s.id,ROLES[s.role]||s.role);await loadStaff()}catch(e){console.error(e);$("staffMessage").textContent="No se pudo quitar el acceso."}});tdX.appendChild(x)}
  tr.appendChild(tdX);body.appendChild(tr);
 });
 $("staffHelp").textContent=Object.entries(ROLES).map(([k,v])=>`${v}: ${ROLE_HELP[k]}`).join("  ·  ");
}
async function save(s,patch,detail,action){
 try{await setDoc(doc(db,"staff",s.id),patch,{merge:true});Object.assign(s,patch);await logAudit(action,s.id,detail);$("staffMessage").textContent="Cambio guardado."}
 catch(e){console.error(e);$("staffMessage").textContent="No se pudo guardar el cambio.";await loadStaff()}
}
$("staffForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!can.admin())return;
 const email=$("staffEmail").value.trim().toLowerCase(),role=$("staffRole").value,msg=$("staffMessage");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.textContent="Escribe un correo de Google válido.";return}
 try{await setDoc(doc(db,"staff",email),{email,role,active:true,addedBy:state.currentUser.email||"",createdAt:serverTimestamp()});
  await logAudit("Acceso concedido",email,ROLES[role]);$("staffEmail").value="";msg.textContent=`Acceso concedido a ${email}. Debe entrar con esa cuenta de Google.`;await loadStaff()}
 catch(err){console.error(err);msg.textContent="No se pudo conceder el acceso."}
});
(()=>{const sel=$("staffRole");Object.entries(ROLES).forEach(([k,v])=>sel.appendChild(new Option(v,k)));sel.value="rrhh"})();
