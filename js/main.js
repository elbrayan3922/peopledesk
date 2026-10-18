/* Punto de entrada: sesión, pestañas y arranque. */
import "./theme.js";
import "./scanner.js";
import "./manual.js";
import "./export.js";
import {$,state} from "./state.js";
import {auth,googleProvider,signInWithPopup,signInWithRedirect,signOut,onAuthStateChanged} from "./firebase.js";
import {startClock} from "./time.js";
import {startClockSync} from "./clock.js";
import {loadSchedule,loadConfig,openSchedule} from "./schedule.js";
import {resolveRole,applyRole,loadStaff} from "./roles.js";
import {loadConsents} from "./consent.js";
import {logAudit,loadAudit} from "./audit.js";
import {loadBackupMeta,renderParams,refreshStatus} from "./backup.js";
import {openPayroll} from "./payroll-ui.js";
import "./alerts.js";
import {loadEmployees,renderEmployees} from "./employees.js";
import {renderCards} from "./cards.js";
import {loadAttendanceIfStale,renderAttendance} from "./attendance.js";
import {loadPermissions,loadPermissionsIfStale,renderPermissions,updatePermissionStats} from "./permissions.js";
import {setMethod} from "./methods.js";
import {stopFace} from "./face.js";
import {updateChrome} from "./layout.js";
import "./dashboard.js";

startClock();
/* La hora y los horarios se cargan sin sesión: la terminal pública los necesita. */
startClockSync();loadSchedule();setInterval(loadSchedule,10*60*1000);
const PAGE_IDS=["dashboardPage","employeesPage","cardsPage","attendancePage","permissionsPage","orgChartPage","schedulePage","payrollPage","auditPage","adminPage"];
function showPage(id){PAGE_IDS.forEach(x=>$(x).hidden=x!==id);document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===id));if(state.currentUser)updateChrome(id);if(id==="cardsPage")renderCards();if(id!=="attendancePage")stopFace();if(id==="attendancePage"||id==="dashboardPage"){loadAttendanceIfStale();loadPermissionsIfStale()}if(id==="permissionsPage")loadPermissionsIfStale();if(id==="schedulePage")openSchedule();if(id==="payrollPage")openPayroll();if(id==="auditPage")loadAudit();if(id==="adminPage"){loadStaff();renderParams();loadBackupMeta();refreshStatus()}}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
function setAdminVisible(v){document.body.classList.toggle("is-admin",v);$("adminPanel").hidden=!v;$("pageTitle").textContent=v?"Panel de control":"Terminal de asistencia";$("pageSubtitle").textContent=v?"Gestión de personal, asistencia y permisos.":"Acerca tu tarjeta QR a la cámara para registrar tu entrada o salida.";$("userBadge").textContent=v&&state.currentUser?(state.currentUser.email||""):"";$("sideAvatar").textContent=v&&state.currentUser?(state.currentUser.email||"?").charAt(0).toUpperCase():""}
$("loginOpenButton").addEventListener("click",()=>{$("loginMessage").textContent="";$("loginDialog").showModal();$("loginButton").focus()});
$("loginCancel").addEventListener("click",()=>$("loginDialog").close());
$("loginDialog").addEventListener("click",e=>{if(e.target===$("loginDialog"))$("loginDialog").close()});
const GOOGLE_ERRORS={"auth/popup-closed-by-user":"Cerraste la ventana de Google antes de terminar.","auth/cancelled-popup-request":"Ya hay una ventana de Google abierta.","auth/unauthorized-domain":"Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).","auth/operation-not-allowed":"El acceso con Google no está activado en Firebase (Authentication → Sign-in method).","auth/network-request-failed":"Sin conexión. Revisa tu internet e inténtalo de nuevo.","auth/account-exists-with-different-credential":"Esa cuenta ya existe con otro método de acceso."};
$("loginButton").addEventListener("click",async()=>{$("loginButton").disabled=true;$("loginMessage").textContent="Abriendo Google...";try{await signInWithPopup(auth,googleProvider);$("loginMessage").textContent="Verificando permisos..."}catch(err){console.error("[Sesión] Google:",err);const code=err&&err.code;if(code==="auth/popup-blocked"||code==="auth/operation-not-supported-in-this-environment"){try{$("loginMessage").textContent="Redirigiendo a Google...";await signInWithRedirect(auth,googleProvider);return}catch(e2){console.error(e2)}}$("loginMessage").textContent=GOOGLE_ERRORS[code]||"No se pudo iniciar sesión con Google. Inténtalo de nuevo."}finally{$("loginButton").disabled=false}});
$("logoutButton").addEventListener("click",async()=>{try{await signOut(auth);$("loginMessage").textContent="Sesión cerrada."}catch(e){console.error(e);$("loginMessage").textContent="No se pudo cerrar la sesión."}});
let loggedFor=null;
async function denyAccess(user){
 /* Con Google cualquier cuenta puede autenticarse: los roles y las reglas deciden quién entra. */
 const who=user.email||"Esta cuenta";console.warn("[Sesión] Cuenta sin permiso de acceso: "+who);state.currentUser=null;applyRole(null);try{await signOut(auth)}catch(e){console.error(e)}
 $("loginMessage").textContent=`${who} no tiene acceso al panel. Pide al administrador que te agregue en Administración → Accesos y roles.`;if(!$("loginDialog").open)$("loginDialog").showModal();
}
onAuthStateChanged(auth,async user=>{state.currentUser=user;console.info(user?"[Sesión] Usuario autenticado.":"[Sesión] Sin sesión activa.");if(!user){applyRole(null);loggedFor=null;state.consents={};state.backupMeta=null;if(state.currentMethod!=="qr")await setMethod("qr");state.scanSequence++;clearTimeout(state.resultTimeout);$("scanResult").hidden=true;$("scanResult").textContent="";state.employees=[];state.attendance=[];state.permissions=[];renderEmployees();renderAttendance();renderPermissions();updatePermissionStats();setAdminVisible(false);showPage("attendancePage");return}if($("loginDialog").open)$("loginMessage").textContent="Verificando permisos...";
const role=await resolveRole(user);if(!role){await denyAccess(user);return}
applyRole(role);console.info("[Sesión] Rol: "+role);
await Promise.all([loadConfig(),loadConsents()]);
try{await loadEmployees()}catch(err){
if(err&&err.code==="permission-denied"){await denyAccess(user);return}
console.error("Error cargando empleados:",err);setAdminVisible(true);if($("loginDialog").open)$("loginDialog").close();$("employeeMessage").textContent="No se pudieron cargar los empleados. Revisa las reglas de Firestore.";return}
setAdminVisible(true);if($("loginDialog").open)$("loginDialog").close();loadPermissions();if(role==="admin")loadBackupMeta();
if(loggedFor!==user.uid){loggedFor=user.uid;logAudit("Inicio de sesión","panel","")}
showPage("dashboardPage")});
