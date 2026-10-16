/* Selector de método de registro: QR / Manual / Biométrica. */
import {$,state} from "./state.js";
import {stopScanner} from "./scanner.js";
import {updateBioSupport} from "./biometric.js";
import {getClockParts,getAttendanceMode} from "./time.js";

export async function setMethod(m){
 if(m!=="qr"&&state.scanner)await stopScanner();
 state.currentMethod=m;
 document.querySelectorAll(".method-btn").forEach(b=>{const on=b.dataset.method===m;b.classList.toggle("active",on);b.setAttribute("aria-selected",String(on))});
 $("qrPanel").hidden=m!=="qr";$("manualPanel").hidden=m!=="manual";$("bioPanel").hidden=m!=="biometrico";
 if(m==="manual"){const p=getClockParts();$("manualTime").value=`${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}`;$("manualType").value=getAttendanceMode(p)}
 if(m==="biometrico")updateBioSupport();
}
document.querySelectorAll(".method-btn").forEach(b=>b.addEventListener("click",()=>setMethod(b.dataset.method)));
