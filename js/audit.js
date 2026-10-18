/* Bitácora de auditoría: quién hizo qué y cuándo. Los registros no se pueden editar ni borrar (lo imponen las reglas de Firestore).
 * Registrar nunca debe romper la acción principal: si falla, solo avisa en la consola. */
import {$,state,el} from "./state.js";
import {db,collection,addDoc,getDocs,query,orderBy,limit,serverTimestamp} from "./firebase.js";
import {nowMs} from "./clock.js";
import {ensureXLSX} from "./lib.js";
import {TZ} from "./state.js";

export async function logAudit(action,target="",detail=""){
 if(!state.currentUser||!state.role)return;
 try{await addDoc(collection(db,"auditLog"),{at:serverTimestamp(),ts:nowMs(),actor:String(state.currentUser.email||"").toLowerCase(),role:state.role,action:String(action).slice(0,80),target:String(target).slice(0,120),detail:String(detail).slice(0,500)})}
 catch(e){console.warn("[Auditoría] No se pudo registrar «"+action+"»:",e&&e.code||e)}
}
const fmt=ms=>ms?new Intl.DateTimeFormat("es-SV",{timeZone:TZ,dateStyle:"short",timeStyle:"medium"}).format(new Date(ms)):"";
let rows=[];
export async function loadAudit(){
 const msg=$("auditMessage");msg.textContent="Cargando...";
 try{
  const snap=await getDocs(query(collection(db,"auditLog"),orderBy("at","desc"),limit(500)));
  rows=snap.docs.map(d=>{const x=d.data();return{...x,ms:x.at&&x.at.toMillis?x.at.toMillis():x.ts}});
  const sel=$("auditFilter"),prev=sel.value;sel.replaceChildren(new Option("Todas las acciones","todas"));
  [...new Set(rows.map(r=>r.action))].sort((a,b)=>a.localeCompare(b,"es")).forEach(a=>sel.appendChild(new Option(a,a)));
  if([...sel.options].some(o=>o.value===prev))sel.value=prev;
  msg.textContent=`${rows.length} movimiento(s) recientes.`;renderAudit();
 }catch(e){console.error(e);msg.textContent="No se pudo cargar la bitácora. Solo la ve el administrador."}
}
function visible(){
 const t=$("auditSearch").value.trim().toLocaleLowerCase("es"),f=$("auditFilter").value;
 return rows.filter(r=>(f==="todas"||r.action===f)&&(!t||[r.actor,r.action,r.target,r.detail,r.role].some(v=>String(v||"").toLocaleLowerCase("es").includes(t))));
}
export function renderAudit(){
 const body=$("auditList");body.replaceChildren();const v=visible();
 v.forEach(r=>{const tr=el("tr");[fmt(r.ms),r.actor,r.role,r.action,r.target,r.detail].forEach((x,i)=>{const td=el("td",i===5?"audit-detail":"",x||"");if(i===2){td.textContent="";td.appendChild(el("span","badge neutral",x||""))}tr.appendChild(td)});body.appendChild(tr)});
 $("auditEmpty").style.display=v.length?"none":"block";
}
$("auditSearch").addEventListener("input",renderAudit);$("auditFilter").addEventListener("change",renderAudit);$("auditRefresh").addEventListener("click",loadAudit);
$("auditExport").addEventListener("click",async()=>{
 if(!(await ensureXLSX())){$("auditMessage").textContent="No se pudo cargar la librería de Excel.";return}
 const data=visible().map(r=>({"Fecha y hora":fmt(r.ms),"Usuario":r.actor,"Rol":r.role,"Acción":r.action,"Objetivo":r.target,"Detalle":r.detail}));
 if(!data.length){$("auditMessage").textContent="No hay movimientos para exportar.";return}
 const ws=XLSX.utils.json_to_sheet(data);ws["!cols"]=[20,30,10,32,34,70].map(w=>({wch:w}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Auditoría");XLSX.writeFile(wb,`auditoria_${new Date(nowMs()).toISOString().slice(0,10)}.xlsx`);
});
