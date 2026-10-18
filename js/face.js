/* Reconocimiento facial (solo administrador).
 * - Usa @vladmandic/face-api (TensorFlow.js) en el navegador; se descarga solo al abrir el método "Facial".
 * - Guarda únicamente el descriptor numérico del rostro (128 valores) en employees/{id}.faceDescriptor, nunca la foto.
 * - No incluye detección de "vida" (liveness): una foto de la persona podría engañarlo. Úsalo con supervisión. */
import {$,state} from "./state.js";
import {db,doc,updateDoc,serverTimestamp} from "./firebase.js";
import {recordAttendance,showScanResult} from "./attendance.js";
import {playScanSound} from "./sound.js";
import {loadEmployees} from "./employees.js";
import {ensureConsent} from "./consent.js";
import {logAudit} from "./audit.js";

/* ===== Configuración ===== */
const FACE_API_URL="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js";
const MODEL_URL="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";
const MATCH_THRESHOLD=0.5;     // distancia máxima para aceptar un rostro (más bajo = más estricto; face-api usa 0.6 por defecto)
const MIN_MARGIN=0.06;         // el mejor candidato debe superar al segundo por este margen (evita confundir parecidos)
const STREAK_NEEDED=3;         // lecturas consecutivas del mismo empleado antes de registrar
const SAMPLES=5;               // capturas al registrar un rostro
const ENROLL_MAX_SPREAD=0.45;  // las capturas del registro deben parecerse entre sí
const TICK_MS=450;             // cada cuánto se analiza la cámara
const COOLDOWN_MS=8000;        // tiempo antes de volver a registrar a la misma persona
const UNKNOWN_NOTICE_MS=6000;  // tiempo mínimo entre avisos de "rostro no reconocido"

/* ===== Matemática pura (se puede probar sin cámara) ===== */
export function distance(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d}return Math.sqrt(s)}
export function averageDescriptors(list){const n=list.length,out=new Float32Array(list[0].length);for(const d of list)for(let i=0;i<out.length;i++)out[i]+=d[i]/n;return out}
/* candidates: [{employee, descriptor}] → {employee, distance} o null si no hay coincidencia clara */
export function findMatch(descriptor,candidates,threshold=MATCH_THRESHOLD,margin=MIN_MARGIN){
 const ranked=candidates.map(c=>({employee:c.employee,distance:distance(descriptor,c.descriptor)})).sort((a,b)=>a.distance-b.distance);
 if(!ranked.length||ranked[0].distance>threshold)return null;
 if(ranked.length>1&&ranked[1].distance-ranked[0].distance<margin)return null;
 return ranked[0];
}

/* ===== Empleados con rostro registrado ===== */
let cache={src:null,list:[]};
function enrolledList(){
 if(cache.src!==state.employees){
  cache={src:state.employees,list:state.employees.filter(e=>Array.isArray(e.faceDescriptor)&&e.faceDescriptor.length===128).map(e=>({employee:e,descriptor:Float32Array.from(e.faceDescriptor)}))};
 }
 return cache.list;
}

/* ===== Librería y modelos (carga bajo demanda) ===== */
let libPromise=null;
function loadLibrary(){
 if(libPromise)return libPromise;
 libPromise=new Promise((resolve,reject)=>{
  if(window.faceapi)return resolve();
  const s=document.createElement("script");
  s.src=FACE_API_URL;s.onload=resolve;
  s.onerror=()=>reject(new Error("No se pudo descargar la librería de reconocimiento facial. Revisa tu conexión."));
  document.head.appendChild(s);
 }).then(()=>Promise.all([
  window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
  window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
  window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
 ])).catch(err=>{libPromise=null;throw err});
 return libPromise;
}
function detect(){
 const fa=window.faceapi;
 return fa.detectSingleFace($("faceVideo"),new fa.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5})).withFaceLandmarks(true).withFaceDescriptor();
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ===== Cámara y bucle de reconocimiento ===== */
let running=false,enrolling=false,stream=null,timer=null,streak={id:null,n:0},lastNotice=0;
const lastSeen=new Map();

function setStatus(text){$("faceStatus").textContent=text}
function setButtons(){$("faceStart").hidden=running;$("faceStop").hidden=!running}

export async function startFace(){
 if(running)return true;
 const msg=$("faceMessage");
 if(!window.isSecureContext||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){msg.textContent="La cámara requiere HTTPS y un navegador compatible.";return false}
 $("faceStart").disabled=true;msg.textContent="Cargando modelos de reconocimiento (la primera vez puede tardar unos segundos)...";
 try{
  await loadLibrary();
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false});
  const video=$("faceVideo");video.srcObject=stream;await video.play();
  running=true;streak={id:null,n:0};setButtons();msg.textContent="";setStatus("Buscando rostro...");
  console.info("[Facial] Cámara y modelos listos.");
  tick();
  return true;
 }catch(err){
  console.error("[Facial] No se pudo iniciar:",err);
  stopFace();
  msg.textContent=err&&err.name==="NotAllowedError"?"Permiso de cámara denegado. Actívalo en el navegador.":err&&err.name==="NotFoundError"?"No se encontró ninguna cámara.":(err&&err.message)||"No se pudo iniciar el reconocimiento facial.";
  return false;
 }finally{$("faceStart").disabled=false}
}

export function stopFace(){
 running=false;enrolling=false;clearTimeout(timer);timer=null;
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 const video=$("faceVideo");if(video)video.srcObject=null;
 streak={id:null,n:0};setButtons();setStatus("Cámara detenida.");
}

async function tick(){
 if(!running)return;
 try{if(!enrolling)await handleDetection(await detect())}
 catch(err){console.error("[Facial] Error al analizar la imagen:",err)}
 if(running)timer=setTimeout(tick,TICK_MS);
}

async function handleDetection(det){
 if(!det){streak={id:null,n:0};setStatus("Buscando rostro...");return}
 const enrolled=enrolledList();
 if(!enrolled.length){setStatus("No hay rostros registrados. Registra empleados abajo.");return}
 const match=findMatch(det.descriptor,enrolled);
 if(!match){
  streak={id:null,n:0};setStatus("Rostro no reconocido.");
  const now=Date.now();
  if(now-lastNotice>UNKNOWN_NOTICE_MS){lastNotice=now;playScanSound("error");showScanResult("Rostro no reconocido. Acércate, mejora la luz o usa otro método.",++state.scanSequence,"error")}
  return;
 }
 const emp=match.employee;
 streak=streak.id===emp.id?{id:emp.id,n:streak.n+1}:{id:emp.id,n:1};
 setStatus(`Verificando a ${emp.name}... (${streak.n}/${STREAK_NEEDED})`);
 if(streak.n<STREAK_NEEDED)return;
 streak={id:null,n:0};
 const now=Date.now();
 if(now-(lastSeen.get(emp.id)||0)<COOLDOWN_MS)return;
 lastSeen.set(emp.id,now);
 await recordAttendance(emp,++state.scanSequence,{method:"facial",distance:match.distance});
}

/* ===== Registro (enrolamiento) de rostros ===== */
async function enrollFace(){
 if(!state.currentUser)return;
 const msg=$("faceMessage"),emp=state.employees.find(x=>x.id===$("faceEmployee").value);
 if(!emp){msg.textContent="Selecciona un empleado.";return}
 if(!(await ensureConsent(emp,"facial"))){msg.textContent="No se registró el rostro: falta el consentimiento del empleado.";return}
 if(!running&&!(await startFace()))return;
 enrolling=true;$("faceEnroll").disabled=true;
 try{
  const samples=[];let tries=0;
  while(samples.length<SAMPLES&&tries<SAMPLES*6){
   tries++;msg.textContent=`Mira a la cámara... captura ${samples.length+1} de ${SAMPLES}`;
   const det=await detect();
   if(det)samples.push(det.descriptor);
   await sleep(det?450:300);
  }
  if(samples.length<SAMPLES){msg.textContent="No se detectó el rostro con claridad. Mejora la luz e inténtalo otra vez.";return}
  let spread=0;
  for(let i=0;i<samples.length;i++)for(let j=i+1;j<samples.length;j++)spread=Math.max(spread,distance(samples[i],samples[j]));
  if(spread>ENROLL_MAX_SPREAD){msg.textContent="Las capturas no coinciden entre sí (¿se movió o hay mala luz?). Inténtalo de nuevo.";return}
  const avg=averageDescriptors(samples);
  const clash=findMatch(avg,enrolledList().filter(c=>c.employee.id!==emp.id),MATCH_THRESHOLD,0);
  if(clash){msg.textContent=`Este rostro ya está registrado como ${clash.employee.name}. No se guardó.`;return}
  await updateDoc(doc(db,"employees",emp.id),{faceDescriptor:Array.from(avg,x=>Math.round(x*1e5)/1e5),faceAt:serverTimestamp()});
  await loadEmployees();await logAudit("Rostro registrado",emp.code,emp.name||"");
  msg.textContent=`Rostro registrado para ${emp.name}.`;
  console.info("[Facial] Rostro registrado: "+emp.code);
 }catch(err){
  console.error("[Facial] Error al registrar el rostro:",err);
  msg.textContent="No se pudo registrar el rostro. Revisa tu sesión y las reglas de Firestore.";
 }finally{enrolling=false;$("faceEnroll").disabled=false}
}
async function removeFace(){
 if(!state.currentUser)return;
 const msg=$("faceMessage"),emp=state.employees.find(x=>x.id===$("faceEmployee").value);
 if(!emp){msg.textContent="Selecciona un empleado.";return}
 if(!emp.faceDescriptor){msg.textContent="Ese empleado no tiene rostro registrado.";return}
 try{await updateDoc(doc(db,"employees",emp.id),{faceDescriptor:null,faceAt:null});await loadEmployees();await logAudit("Rostro eliminado",emp.code,emp.name||"");msg.textContent=`Rostro eliminado para ${emp.name}.`}
 catch(err){console.error(err);msg.textContent="No se pudo quitar el rostro. Revisa Firestore."}
}

$("faceStart").addEventListener("click",startFace);
$("faceStop").addEventListener("click",stopFace);
$("faceEnroll").addEventListener("click",enrollFace);
$("faceRemove").addEventListener("click",removeFace);
