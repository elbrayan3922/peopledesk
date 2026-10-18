/* Registro manual (solo administrador) para cuando el QR no funciona. */
import {$,state} from "./state.js";
import {recordAttendance,showScanResult} from "./attendance.js";
import {getClockParts} from "./time.js";
import {logAudit} from "./audit.js";

/* Manual */
$("manualForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!state.currentUser)return;
 const seq=++state.scanSequence,emp=state.employees.find(x=>x.id===$("manualEmployee").value);
 if(!emp){showScanResult("Selecciona un empleado.",seq,"error");return}
 const t=$("manualTime").value;if(!/^\d{2}:\d{2}$/.test(t)){showScanResult("Indica la hora real del registro.",seq,"error");return}
 const [h,m]=t.split(":").map(Number),now=getClockParts();
 if(h*60+m>now.hour*60+now.minute){showScanResult("La hora no puede ser futura.",seq,"error");return}
 const note=$("manualNote").value.trim(),reason=$("manualReason").value+(note?` — ${note}`:"");
 $("manualButton").disabled=true;
 try{const type=$("manualType").value,ok=await recordAttendance(emp,seq,{method:"manual",type,parts:{hour:h,minute:m,second:0},reason});if(ok)await logAudit("Registro manual de asistencia",emp.code,`${type} a las ${t} · ${reason}`);$("manualNote").value=""}
 finally{$("manualButton").disabled=false}
});
