/* Consentimiento para datos biométricos (rostro y huella): pantalla de aceptación, registro y revocación.
 * Sin consentimiento vigente no se puede registrar rostro ni huella. Se guarda en consents/{empleado}.
 * Nota: el texto es una base sensata; hazlo revisar por un abogado antes de usarlo con personal real. */
import {$,state,can,el} from "./state.js";
import {db,collection,getDocs,doc,setDoc,updateDoc,serverTimestamp} from "./firebase.js";
import {logAudit} from "./audit.js";

export const CONSENT_VERSION="2026-10";
const KIND_LABEL={facial:"reconocimiento facial",huella:"huella o rostro del dispositivo"};
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();

export async function loadConsents(){
 if(!state.currentUser)return;
 try{const snap=await getDocs(collection(db,"consents"));state.consents=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]))}
 catch(e){console.warn("[Consentimiento] No se pudieron cargar:",e&&e.code||e)}
}
export function hasConsent(emp,kind){const c=state.consents[emp.id];return !!c&&!c.revoked&&c.version===CONSENT_VERSION&&(c.kinds||[]).includes(kind)}

let resolver=null;
function finish(v){if(resolver){const r=resolver;resolver=null;r(v)}}
export function ensureConsent(emp,kind){
 if(state.config&&state.config.biometricEnabled===false){alert("La biometría está desactivada en Administración → Privacidad.");return Promise.resolve(false)}
 if(hasConsent(emp,kind))return Promise.resolve(true);
 const months=(state.config&&state.config.retentionMonths)||12;
 $("consentFor").textContent=`Empleado: ${emp.name} (${emp.code})`;
 const box=$("consentText");box.replaceChildren();
 const items=[
  ["Qué se recoge",kind==="facial"?"Una representación numérica del rostro (128 números). No se guarda ninguna fotografía.":"Un identificador de la credencial del dispositivo. La huella o el rostro nunca salen del dispositivo ni se guardan en el sistema."],
  ["Para qué se usa","Únicamente para identificar al empleado y registrar su asistencia (entradas y salidas). No se usa con otros fines ni se comparte con terceros."],
  ["Cuánto se conserva",`Mientras la persona labore en la empresa y, como máximo, ${months} meses después. Pasado ese plazo se elimina.`],
  ["Es voluntario","Puede negarse sin ninguna consecuencia laboral: siempre podrá registrarse con su tarjeta QR o de forma manual."],
  ["Sus derechos","Puede pedir acceso, corrección o eliminación de sus datos y revocar este consentimiento en cualquier momento en Recursos Humanos. Al revocar, sus datos biométricos se borran."],
  ["Responsable","Corp LiteX · Recursos Humanos (INVAS 2A)."]
 ];
 items.forEach(([t,d])=>{const p=el("p");p.appendChild(el("strong",null,t+". "));p.appendChild(document.createTextNode(d));box.appendChild(p)});
 $("consentKind").textContent=KIND_LABEL[kind]||kind;$("consentCheck").checked=false;$("consentName").value="";$("consentMessage").textContent="";
 $("consentAccept").dataset.kind=kind;$("consentAccept").dataset.emp=emp.id;
 return new Promise(resolve=>{resolver=resolve;$("consentDialog").showModal()});
}
$("consentCancel").addEventListener("click",()=>$("consentDialog").close());
$("consentDialog").addEventListener("close",()=>finish(false));
$("consentAccept").addEventListener("click",async()=>{
 const emp=state.employees.find(e=>e.id===$("consentAccept").dataset.emp),kind=$("consentAccept").dataset.kind,msg=$("consentMessage");
 if(!emp||!can.hr())return;
 if(!$("consentCheck").checked){msg.textContent="Marca la casilla para confirmar que el empleado leyó y acepta.";return}
 if(norm($("consentName").value)!==norm(emp.name)){msg.textContent="Escribe el nombre completo del empleado tal como está registrado.";return}
 $("consentAccept").disabled=true;msg.textContent="Guardando consentimiento...";
 try{
  const prev=state.consents[emp.id],kinds=[...new Set([...(prev&&!prev.revoked&&prev.version===CONSENT_VERSION?prev.kinds||[]:[]),kind])];
  const rec={employeeId:emp.id,code:emp.code||"",name:emp.name||"",kinds,version:CONSENT_VERSION,signedName:$("consentName").value.trim(),retentionMonths:(state.config&&state.config.retentionMonths)||12,revoked:false,registeredBy:state.currentUser.email||"",acceptedAt:serverTimestamp()};
  await setDoc(doc(db,"consents",emp.id),rec);state.consents[emp.id]={...rec,acceptedAt:new Date()};
  await logAudit("Consentimiento biométrico aceptado",emp.code,`${KIND_LABEL[kind]} · versión ${CONSENT_VERSION}`);
  const r=resolver;resolver=null;$("consentDialog").close();if(r)r(true);
 }catch(err){console.error(err);msg.textContent="No se pudo guardar el consentimiento. Revisa tus permisos."}
 finally{$("consentAccept").disabled=false}
});

/* Revocar: borra los datos biométricos del empleado y marca el consentimiento como revocado. */
export async function revokeConsent(emp){
 await updateDoc(doc(db,"employees",emp.id),{faceDescriptor:null,faceAt:null,biometricId:null,biometricAt:null});
 if(state.consents[emp.id])await setDoc(doc(db,"consents",emp.id),{revoked:true,revokedAt:serverTimestamp(),revokedBy:state.currentUser.email||""},{merge:true});
 state.consents[emp.id]={...(state.consents[emp.id]||{}),revoked:true};
 await logAudit("Consentimiento revocado y biometría eliminada",emp.code,emp.name||"");
}

/* Interruptor general: si la biometría está desactivada, desaparecen los métodos Biométrica y Facial. */
export function applyBiometricSetting(){
 const on=!(state.config&&state.config.biometricEnabled===false);
 document.querySelectorAll('.method-btn[data-method="biometrico"],.method-btn[data-method="facial"]').forEach(b=>b.hidden=!on);
 if(!on&&(state.currentMethod==="biometrico"||state.currentMethod==="facial"))document.querySelector('.method-btn[data-method="qr"]').click();
}
document.addEventListener("peopledesk:config",applyBiometricSetting);
