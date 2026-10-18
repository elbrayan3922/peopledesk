/* Registro biométrico con WebAuthn (huella / rostro / PIN del dispositivo). Solo administrador. */
import {$,state} from "./state.js";
import {db,doc,updateDoc,serverTimestamp} from "./firebase.js";
import {recordAttendance,showScanResult} from "./attendance.js";
import {playScanSound} from "./sound.js";
import {loadEmployees} from "./employees.js";

/* Biométrica (WebAuthn): usa la huella, el rostro o el PIN del propio dispositivo */
const b64u=buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const fromB64u=s=>{s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))};
export async function updateBioSupport(){
 let ok=!!(window.PublicKeyCredential&&navigator.credentials&&window.isSecureContext),msg;
 if(!ok)msg="Este navegador o conexión no admite biometría. Abre el sitio con HTTPS en un navegador actualizado.";
 else{try{ok=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable():true}catch{ok=false}
  msg=ok?"Biometría disponible en este dispositivo.":"Este dispositivo no tiene huella, rostro ni PIN configurado."}
 $("bioSupport").textContent=msg;$("bioScanButton").disabled=!ok;$("bioEnrollButton").disabled=!ok;return ok;
}
$("bioEnrollButton").addEventListener("click",async()=>{
 if(!state.currentUser)return;const emp=state.employees.find(x=>x.id===$("bioEmployee").value);
 if(!emp){$("bioMessage").textContent="Selecciona un empleado.";return}
 $("bioEnrollButton").disabled=true;$("bioMessage").textContent="Sigue las indicaciones del dispositivo...";
 try{
  const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:"Corp LiteX RRHH",id:location.hostname},user:{id:new TextEncoder().encode(emp.id),name:emp.code||emp.id,displayName:emp.name||emp.code},pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"discouraged"},timeout:60000,attestation:"none"}});
  const id=b64u(cred.rawId);await updateDoc(doc(db,"employees",emp.id),{biometricId:id,biometricAt:serverTimestamp()});
  await loadEmployees();$("bioMessage").textContent=`Biometría registrada para ${emp.name}.`;console.info("[Biometría] Enrolado: "+emp.code);
 }catch(err){console.error("Error de biometría:",err);$("bioMessage").textContent=err&&err.name==="NotAllowedError"?"Operación cancelada o rechazada por el dispositivo.":"No se pudo registrar la biometría. "+(err&&err.message?err.message:"")}
 finally{$("bioEnrollButton").disabled=false}
});
$("bioRemoveButton").addEventListener("click",async()=>{
 if(!state.currentUser)return;const emp=state.employees.find(x=>x.id===$("bioEmployee").value);
 if(!emp){$("bioMessage").textContent="Selecciona un empleado.";return}
 if(!emp.biometricId){$("bioMessage").textContent="Ese empleado no tiene biometría registrada.";return}
 try{await updateDoc(doc(db,"employees",emp.id),{biometricId:null,biometricAt:null});await loadEmployees();$("bioMessage").textContent=`Biometría eliminada para ${emp.name}.`}
 catch(err){console.error(err);$("bioMessage").textContent="No se pudo quitar la biometría. Revisa Firestore."}
});
$("bioScanButton").addEventListener("click",async()=>{
 if(!state.currentUser)return;const seq=++state.scanSequence,enrolled=state.employees.filter(e=>e.biometricId);
 if(!enrolled.length){showScanResult("Aún no hay empleados con biometría registrada. Enrola uno abajo.",seq,"error");return}
 $("bioScanButton").disabled=true;$("bioMessage").textContent="Verifica tu identidad en el dispositivo...";
 try{
  const a=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:location.hostname,allowCredentials:enrolled.map(e=>({type:"public-key",id:fromB64u(e.biometricId),transports:["internal"]})),userVerification:"required",timeout:60000}});
  const emp=enrolled.find(e=>e.biometricId===b64u(a.rawId));
  $("bioMessage").textContent="";
  if(!emp){playScanSound("error");showScanResult("Credencial no reconocida.",seq,"error");return}
  await recordAttendance(emp,seq,{method:"biometrico"});
 }catch(err){console.error("Error de biometría:",err);playScanSound("error");$("bioMessage").textContent="";showScanResult(err&&err.name==="NotAllowedError"?"Verificación cancelada o rechazada.":"No se pudo verificar la biometría.",seq,"error")}
 finally{$("bioScanButton").disabled=false}
});
