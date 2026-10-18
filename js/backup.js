/* Copia de seguridad, restauración, parámetros de planilla/privacidad y estado del sistema (solo administrador). */
import {$,state,can,el,APP_VERSION,TZ} from "./state.js";
import {db,collection,getDocs,getDoc,doc,setDoc,writeBatch,serverTimestamp,Timestamp} from "./firebase.js";
import {logAudit} from "./audit.js";
import {nowMs,clockInfo,syncClock} from "./clock.js";
import {loadConfig} from "./schedule.js";
import {DEFAULT_PARAMS} from "./payroll.js";
import {loadEmployees} from "./employees.js";

const BACKUP_COLLECTIONS=["employees","qrTokens","attendance","permissions","settings","consents"];
const SENSITIVE_FIELDS=["faceDescriptor","biometricId"];

/* Timestamps de Firestore ⇄ JSON */
const ser=v=>v&&typeof v.toMillis==="function"?{__ts:v.toMillis()}:Array.isArray(v)?v.map(ser):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,ser(x)])):v;
const deser=v=>v&&typeof v==="object"&&!Array.isArray(v)&&"__ts" in v?Timestamp.fromMillis(v.__ts):Array.isArray(v)?v.map(deser):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,deser(x)])):v;
const stamp=()=>new Date(nowMs()).toISOString().replace(/[:T]/g,"-").slice(0,16);

export async function loadBackupMeta(){
 try{const s=await getDoc(doc(db,"settings","backup"));state.backupMeta=s.exists()?s.data():null}catch(e){state.backupMeta=null}
 renderBackupMeta();document.dispatchEvent(new Event("peopledesk:data"));
}
const daysSince=ms=>Math.floor((nowMs()-ms)/86400000);
export function backupAgeDays(){const t=state.backupMeta&&state.backupMeta.lastBackupAt;return t&&t.toMillis?daysSince(t.toMillis()):null}
function renderBackupMeta(){
 const d=backupAgeDays(),box=$("backupLast");
 box.textContent=d==null?"Todavía no se ha hecho ninguna copia de seguridad.":`Última copia: hace ${d===0?"menos de un día":d+" día(s)"} · por ${state.backupMeta.by||"—"}.`;
 box.className="backup-last "+(d==null||d>7?"warn":"ok");
}

/* ===== Descargar copia ===== */
$("backupDownload").addEventListener("click",async()=>{
 if(!can.admin())return;const msg=$("backupMessage"),btn=$("backupDownload");btn.disabled=true;msg.textContent="Leyendo datos...";
 try{
  const withBio=$("backupBio").checked,out={app:"peopledesk",version:APP_VERSION,createdAt:new Date(nowMs()).toISOString(),by:state.currentUser.email||"",includesBiometrics:withBio,collections:{}};
  const names=[...BACKUP_COLLECTIONS];if($("backupAudit").checked)names.push("auditLog");if($("backupStaff").checked)names.push("staff");
  const counts={};
  for(const n of names){
   const snap=await getDocs(collection(db,n));
   out.collections[n]=snap.docs.map(d=>{let data=ser(d.data());if(!withBio&&n==="employees"){SENSITIVE_FIELDS.forEach(f=>delete data[f])}return{id:d.id,data}});
   counts[n]=out.collections[n].length;msg.textContent=`Leyendo ${n}... (${counts[n]})`;
  }
  const blob=new Blob([JSON.stringify(out)],{type:"application/json"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`peopledesk_respaldo_${stamp()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  await setDoc(doc(db,"settings","backup"),{lastBackupAt:serverTimestamp(),by:state.currentUser.email||"",counts});
  await logAudit("Copia de seguridad descargada","respaldo",Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(" · ")+(withBio?" · con biometría":""));
  await loadBackupMeta();msg.textContent=`Copia descargada (${Object.values(counts).reduce((a,b)=>a+b,0)} documentos). Guárdala en un lugar seguro: contiene datos personales y los QR de las tarjetas.`;
 }catch(err){console.error(err);msg.textContent="No se pudo generar la copia. Revisa tu sesión y las reglas de Firestore."}
 finally{btn.disabled=false}
});

/* ===== Restaurar ===== */
let pending=null;
$("restoreFile").addEventListener("change",async()=>{
 const f=$("restoreFile").files[0],msg=$("restoreMessage");pending=null;$("restoreGo").disabled=true;$("restoreConfirm").value="";if(!f)return;
 try{
  const data=JSON.parse(await f.text());
  if(data.app!=="peopledesk"||!data.collections)throw new Error("Formato");
  pending=data;const parts=BACKUP_COLLECTIONS.filter(n=>data.collections[n]).map(n=>`${n}: ${data.collections[n].length}`);
  msg.textContent=`Copia del ${String(data.createdAt||"").slice(0,16).replace("T"," ")} (${data.by||"—"}). Contiene → ${parts.join(" · ")}. Escribe RESTAURAR para continuar.`;
 }catch(e){msg.textContent="Ese archivo no es una copia válida de PeopleDesk."}
});
$("restoreConfirm").addEventListener("input",()=>{$("restoreGo").disabled=!(pending&&$("restoreConfirm").value.trim()==="RESTAURAR")});
$("restoreGo").addEventListener("click",async()=>{
 if(!can.admin()||!pending)return;const msg=$("restoreMessage");$("restoreGo").disabled=true;let written=0,skipped=0;
 try{
  const current=new Map(state.employees.map(e=>[e.id,e]));
  for(const n of BACKUP_COLLECTIONS){
   const items=pending.collections[n]||[];
   for(let i=0;i<items.length;i+=400){
    const batch=writeBatch(db);
    items.slice(i,i+400).forEach(({id,data})=>{
     let d=deser(data);
     if(n==="employees"){
      const cur=current.get(id);
      if(cur&&cur.qrToken){d.qrToken=cur.qrToken}                        // el QR vigente nunca cambia
      if(!pending.includesBiometrics){SENSITIVE_FIELDS.forEach(f=>{if(cur&&cur[f]!==undefined)d[f]=cur[f];else delete d[f]})}
     }
     batch.set(doc(db,n,id),d,{merge:true});written++;
    });
    await batch.commit();msg.textContent=`Restaurando ${n}... ${written} documentos`;
   }
  }
  await logAudit("Copia de seguridad restaurada","respaldo",`${written} documentos escritos desde copia del ${String(pending.createdAt||"").slice(0,10)}`);
  await loadEmployees();await loadConfig();msg.textContent=`Restauración completa: ${written} documentos. Los QR vigentes se conservaron.`;
 }catch(err){console.error(err);msg.textContent=`La restauración se detuvo tras ${written} documentos: ${err&&err.code||err}. Nada se borró.`}
 finally{$("restoreFile").value="";pending=null;$("restoreConfirm").value=""}
});

/* ===== Parámetros de planilla y privacidad ===== */
const PARAM_FIELDS=[["otPct","pOt"],["nightPct","pNight"],["restPct","pRest"],["holidayPct","pHoliday"],["monthDays","pMonth"],["defaultSalary","pSalary"],["otMinMin","pOtMin"],["retentionMonths","pRetention"]];
export function renderParams(){
 const c=state.config||DEFAULT_PARAMS;PARAM_FIELDS.forEach(([k,id])=>$(id).value=c[k]);$("pPermPay").checked=!!c.permWithPay;$("pBio").checked=c.biometricEnabled!==false;
}
document.addEventListener("peopledesk:config",renderParams);
$("paramsSave").addEventListener("click",async()=>{
 if(!can.admin())return;const msg=$("paramsMessage"),next={...DEFAULT_PARAMS};
 for(const [k,id] of PARAM_FIELDS){const v=Number($(id).value);if(!Number.isFinite(v)||v<0){msg.textContent="Revisa los valores: deben ser números positivos.";return}next[k]=v}
 if(next.monthDays<1||next.monthDays>31){msg.textContent="Los días del mes base deben estar entre 1 y 31.";return}
 next.permWithPay=$("pPermPay").checked;next.biometricEnabled=$("pBio").checked;
 try{
  const before=state.config||{},diff=Object.keys(next).filter(k=>before[k]!==next[k]).map(k=>`${k}: ${before[k]}→${next[k]}`);
  await setDoc(doc(db,"settings","config"),{...next,updatedAt:serverTimestamp(),updatedBy:state.currentUser.email||""});
  state.config=next;document.dispatchEvent(new Event("peopledesk:config"));
  await logAudit("Parámetros actualizados","settings/config",diff.join(" | ")||"Sin cambios");msg.textContent="Parámetros guardados.";
 }catch(err){console.error(err);msg.textContent="No se pudieron guardar los parámetros."}
});

/* ===== Estado del sistema ===== */
export async function refreshStatus(){
 const rows=[],add=(k,v,cls)=>rows.push([k,v,cls||""]);
 const t0=performance.now();let lat=null;
 try{await getDoc(doc(db,"settings","schedule"));lat=Math.round(performance.now()-t0)}catch(e){}
 await syncClock();const ci=clockInfo();
 add("Versión",`PeopleDesk ${APP_VERSION}`);
 add("Conexión",navigator.onLine?"En línea":"Sin internet",navigator.onLine?"ok":"warn");
 add("Latencia a Firestore",lat==null?"Sin respuesta":`${lat} ms`,lat==null?"warn":lat<800?"ok":"warn");
 add("Hora del servidor",ci.synced?`Sincronizada (el equipo ${Math.abs(ci.offsetMs)<1500?"está al día":(ci.offsetMs>0?"atrasa ":"adelanta ")+Math.round(Math.abs(ci.offsetMs)/1000)+" s"})`:`Sin sincronizar (${ci.lastError||"sin datos"})`,ci.synced?"ok":"warn");
 add("Zona horaria",`${TZ} · ${new Intl.DateTimeFormat("es-SV",{timeZone:TZ,dateStyle:"short",timeStyle:"medium"}).format(new Date(nowMs()))}`);
 add("Tu rol",state.role||"—");
 add("Datos cargados",`${state.employees.length} empleados · ${state.permissions.length} permisos · ${state.attendance.length} marcas hoy`);
 const d=backupAgeDays();add("Copia de seguridad",d==null?"Nunca":`hace ${d} día(s)`,d==null||d>7?"warn":"ok");
 const box=$("statusList");box.replaceChildren();rows.forEach(([k,v,c])=>{const li=el("li");li.appendChild(el("span",null,k));li.appendChild(el("b","st "+c,v));box.appendChild(li)});
}
$("statusRefresh").addEventListener("click",refreshStatus);
