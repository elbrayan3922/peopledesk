/* Registro de asistencia común (QR, manual y biométrico) y tabla del día. */
import {$,state} from "./state.js";
import {db,collection,getDocs,query,where,doc,getDoc,runTransaction,serverTimestamp} from "./firebase.js";
import {getClockParts,getDateKey,getTimeLabel,getPunctuality,getAttendanceMode,getRecordType,maskToken} from "./time.js";
import {playScanSound} from "./sound.js";
import {getActivePermission} from "./permissions.js";

export async function loadAttendance(){if(!state.currentUser)return;try{const today=getDateKey(),snap=await getDocs(query(collection(db,"attendance"),where("date","==",today)));state.attendance=snap.docs.map(x=>({id:x.id,...x.data()})).filter(x=>x.date===today).sort((a,b)=>((b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0)-(a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0)));renderAttendance();document.dispatchEvent(new Event("peopledesk:data"));console.info(`[Asistencia] ${state.attendance.length} registro(s) cargados para ${today}.`)}catch(e){console.error(e);$("scannerMessage").textContent="No se pudo cargar la asistencia."}}
export function renderAttendance(){const list=$("attendanceList"),term=String($("attendanceSearch")?.value||"").trim().toLocaleLowerCase("es"),visible=state.attendance.filter(item=>[item.name,item.code,item.position,item.department,getRecordType(item),getMethodLabel(item)].some(v=>String(v||"").toLocaleLowerCase("es").includes(term)));list.replaceChildren();visible.forEach(item=>{const tr=document.createElement("tr"),isExit=getRecordType(item)==="salida";[item.time,isExit?"Salida":"Entrada",item.code,item.name,item.position,item.punctuality,getMethodLabel(item)].forEach((v,i)=>{const td=document.createElement("td");if(i===1){const b=document.createElement("span");b.className="badge "+(isExit?"exit":"neutral");b.textContent=v;td.appendChild(b)}else if(i===5){if(isExit)td.textContent="—";else{const b=document.createElement("span");b.className="badge";if(v==="Tardío")b.classList.add("late");else if(v==="Margen final")b.classList.add("warn");b.textContent=v||"";td.appendChild(b)}}else if(i===6){const b=document.createElement("span");b.className="badge neutral";b.textContent=v;if(item.method==="manual")b.title=`Manual por ${item.registeredBy||"—"}${item.reason?" · "+item.reason:""}`;td.appendChild(b)}else td.textContent=v||"";tr.appendChild(td)});list.appendChild(tr)});const exits=state.attendance.filter(x=>getRecordType(x)==="salida").length,entries=state.attendance.length-exits;$("todayCount").textContent=`${entries} ent. · ${exits} sal.`;$("attendanceEmpty").style.display=visible.length?"none":"block";$("attendanceEmpty").textContent=state.attendance.length?(term?"No hay resultados para esa búsqueda.":""):"Aún no hay asistencias registradas hoy."}
$("attendanceSearch").addEventListener("input",renderAttendance);
export function showScanResult(message,seq,state="success"){if(seq!==state.scanSequence)return;clearTimeout(state.resultTimeout);$("scanResult").hidden=false;$("scanResult").dataset.state=state;$("scanResult").textContent=message;$("lastScanTime").textContent=getTimeLabel();state.resultTimeout=setTimeout(()=>{if(seq===state.scanSequence){$("scanResult").hidden=true;$("scanResult").textContent=""}},10000)}
export function getMethodLabel(item){return ({manual:"Manual",biometrico:"Biométrica",facial:"Facial"})[item&&item.method]||"QR"}
/* La terminal pública no lee la colección "employees": consulta solo el documento qrTokens/{token}. */
export async function registerAttendance(token,seq){
let emp=state.currentUser?state.employees.find(x=>x.qrToken===token):null;
if(!emp&&/^[A-Za-z0-9-]{8,128}$/.test(token)){try{const snap=await getDoc(doc(db,"qrTokens",token));if(snap.exists()){const d=snap.data();emp={id:d.employeeId,code:d.code,name:d.name,position:d.position,department:d.department,status:d.status,qrToken:token}}}catch(err){console.error("[QR] Error al consultar el token:",err);playScanSound("error");showScanResult("No se pudo verificar el QR. Revisa la conexión e inténtalo de nuevo.",seq,"error");return}}
if(!emp){console.warn("[QR] Token no reconocido: "+maskToken(token));playScanSound("error");showScanResult("QR no reconocido. Verifica que la tarjeta pertenezca a un empleado registrado.",seq,"error");return}
await recordAttendance(emp,seq,{method:"qr"})}
/* Registro común para QR, manual y biométrico. opts: {method, type, parts, reason} */
export async function recordAttendance(emp,seq,opts={}){
const method=opts.method||"qr",tag=({manual:"Manual",biometrico:"Biométrica",facial:"Facial"})[method]||"QR";
if(emp.status==="Inactivo"){console.warn(`[${tag}] Empleado inactivo: `+emp.code);playScanSound("error");showScanResult("Este empleado está inactivo. No se registró la asistencia.",seq,"error");return}
const p=opts.parts||getClockParts(),date=getDateKey(),time=getTimeLabel(p),mode=opts.type||getAttendanceMode(p),isExit=mode==="salida",punct=getPunctuality(p),entryRef=doc(db,"attendance",`${emp.id}_${date}`),ref=isExit?doc(db,"attendance",`${emp.id}_${date}_salida`):entryRef;
const perm=getActivePermission(emp.id,date),permNote=perm?` · Tiene permiso aprobado (${perm.type}${perm.partial?` ${perm.startTime}–${perm.endTime}`:""})`:"",via=method==="qr"?"":` · ${tag}`;
try{const result=await runTransaction(db,async tx=>{const old=await tx.get(ref);if(old.exists())return{created:false};let hadEntry=true;if(isExit){const entry=await tx.get(entryRef);hadEntry=entry.exists()}
const base={employeeId:emp.id,code:emp.code,name:emp.name,position:emp.position,department:emp.department,date,time,method};
if(method==="qr"&&emp.qrToken)base.qrToken=emp.qrToken;
if(method==="facial"&&typeof opts.distance==="number")base.faceDistance=Math.round(opts.distance*1000)/1000;
if(method==="manual"){base.reason=opts.reason||"";base.registeredBy=(state.currentUser&&state.currentUser.email)||""}
tx.set(ref,isExit?{...base,type:"salida",punctuality:"Salida",createdAt:serverTimestamp()}:{...base,punctuality:punct.label,createdAt:serverTimestamp()});return{created:true,hadEntry}});
const kind=isExit?"salida":"entrada";
if(result.created){console.info(`[Asistencia] ${kind.toUpperCase()} registrada (${tag}): ${emp.code} · ${time}`);playScanSound("success");
if(isExit)showScanResult((result.hadEntry?`Salida registrada: ${emp.name} · ${time}${via}`:`Salida registrada: ${emp.name} · ${time}${via} · Sin entrada registrada hoy.`)+permNote,seq,result.hadEntry&&!perm?"success":"warning");
else showScanResult(`Asistencia registrada: ${emp.name} · ${time} · ${punct.label}${via}`+permNote,seq,perm?"warning":"success")}
else{console.info(`[Asistencia] Duplicado de ${kind}: ${emp.code}`);playScanSound("duplicate");showScanResult(isExit?`${emp.name} ya tiene una salida registrada hoy. Se conservó el primer registro.`:`${emp.name} ya tiene una entrada registrada hoy. Se conservó el primer registro.`,seq,"warning")}
await loadAttendance()}catch(err){console.error("Error al registrar asistencia:",err);playScanSound("error");showScanResult("No se pudo guardar la asistencia. Revisa las reglas de Firestore.",seq,"error")}}
