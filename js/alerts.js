/* Alertas del panel: anomalías y pendientes que conviene revisar. Se calculan con los datos ya cargados. */
import {$,state,can,el} from "./state.js";
import {getRecordType} from "./time.js";
import {hasConsent} from "./consent.js";
import {backupAgeDays} from "./backup.js";
import {clockInfo} from "./clock.js";

export function computeAlerts(){
 const out=[],active=state.employees.filter(e=>e.status!=="Inactivo"),ids=new Set(active.map(e=>e.id));
 const entries=new Set(state.attendance.filter(r=>getRecordType(r)!=="salida").map(r=>r.employeeId));
 const orphan=state.attendance.filter(r=>getRecordType(r)==="salida"&&ids.has(r.employeeId)&&!entries.has(r.employeeId));
 if(orphan.length)out.push({level:"warn",title:`${orphan.length} salida(s) sin entrada hoy`,detail:orphan.slice(0,4).map(r=>r.name).join(", ")+(orphan.length>4?"…":"")+" · revisa si falta la entrada o fue un turno que cruza medianoche."});
 const manual=state.attendance.filter(r=>r.method==="manual");
 if(manual.length)out.push({level:"info",title:`${manual.length} registro(s) manual(es) hoy`,detail:"Quedan marcados con el motivo y quién los hizo."});
 const noConsent=state.employees.filter(e=>(e.biometricId||Array.isArray(e.faceDescriptor))&&!hasConsent(e,"facial")&&!hasConsent(e,"huella"));
 if(noConsent.length)out.push({level:"warn",title:`${noConsent.length} empleado(s) con biometría y sin consentimiento`,detail:noConsent.slice(0,4).map(e=>e.name).join(", ")+" · en Empleados → Editar puedes revocar y volver a registrar con consentimiento."});
 if(can.admin()){const d=backupAgeDays();if(d==null)out.push({level:"warn",title:"Aún no hay copia de seguridad",detail:"Descarga una en Administración → Copia de seguridad."});else if(d>7)out.push({level:"warn",title:`La última copia de seguridad tiene ${d} días`,detail:"Conviene hacer una cada semana."})}
 const ci=clockInfo();if(!ci.synced&&ci.lastSync===0&&ci.lastError)out.push({level:"info",title:"Reloj sin sincronizar con el servidor",detail:"Se usa la hora del equipo. Las marcas del servidor (createdAt) siguen siendo la referencia."});
 return out;
}
function render(){
 const box=$("dashAlerts");if(!box)return;box.replaceChildren();const list=computeAlerts();
 if(!list.length){box.appendChild(el("p","dash-empty","Todo en orden: no hay alertas por ahora."));return}
 const ul=el("ul","alert-list");list.forEach(a=>{const li=el("li","alert "+a.level);li.appendChild(el("strong",null,a.title));li.appendChild(el("small",null,a.detail));ul.appendChild(li)});box.appendChild(ul);
}
let queued=false;
document.addEventListener("peopledesk:data",()=>{if(queued)return;queued=true;Promise.resolve().then(()=>{queued=false;render()})});
document.addEventListener("peopledesk:config",render);
render();
