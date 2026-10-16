/* Punto de entrada: sesión, pestañas y arranque. */
import "./theme.js";
import "./scanner.js";
import "./manual.js";
import "./export.js";
import {$,state} from "./state.js";
import {auth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "./firebase.js";
import {startClock} from "./time.js";
import {loadEmployees,renderEmployees} from "./employees.js";
import {renderCards} from "./cards.js";
import {loadAttendance,renderAttendance} from "./attendance.js";
import {loadPermissions,renderPermissions,updatePermissionStats} from "./permissions.js";
import {setMethod} from "./methods.js";

startClock();
function showPage(id){["employeesPage","cardsPage","attendancePage","permissionsPage","orgChartPage"].forEach(x=>$(x).hidden=x!==id);document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.page===id));if(id==="cardsPage")renderCards();if(id==="attendancePage"){loadAttendance();loadPermissions()}if(id==="permissionsPage")loadPermissions()}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
function setAdminVisible(v){document.body.classList.toggle("is-admin",v);$("adminPanel").hidden=!v;$("pageTitle").textContent=v?"Panel de control":"Terminal de asistencia";$("pageSubtitle").textContent=v?"Gestión de personal, asistencia y permisos.":"Acerca tu tarjeta QR a la cámara para registrar tu entrada o salida.";$("userBadge").textContent=v&&state.currentUser?(state.currentUser.email||""):""}
$("loginOpenButton").addEventListener("click",()=>{$("loginMessage").textContent="";$("loginDialog").showModal();$("adminEmail").focus()});
$("loginCancel").addEventListener("click",()=>$("loginDialog").close());
$("loginDialog").addEventListener("click",e=>{if(e.target===$("loginDialog"))$("loginDialog").close()});
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginButton").disabled=true;$("loginMessage").textContent="Verificando acceso...";try{await signInWithEmailAndPassword(auth,$("adminEmail").value.trim(),$("adminPassword").value);$("loginForm").reset();$("loginMessage").textContent="Acceso correcto."}catch(err){console.error(err);$("loginMessage").textContent="No se pudo iniciar sesión. Revisa los datos."}finally{$("loginButton").disabled=false}});
$("logoutButton").addEventListener("click",async()=>{try{await signOut(auth);$("loginMessage").textContent="Sesión cerrada."}catch(e){console.error(e);$("loginMessage").textContent="No se pudo cerrar la sesión."}});
onAuthStateChanged(auth,async user=>{state.currentUser=user;console.info(user?"[Sesión] Usuario autenticado.":"[Sesión] Sin sesión activa.");if(!user){if(state.currentMethod!=="qr")await setMethod("qr");state.scanSequence++;clearTimeout(state.resultTimeout);$("scanResult").hidden=true;$("scanResult").textContent="";state.employees=[];state.attendance=[];state.permissions=[];renderEmployees();renderAttendance();renderPermissions();updatePermissionStats();setAdminVisible(false);showPage("attendancePage");return}setAdminVisible(true);if($("loginDialog").open)$("loginDialog").close();try{await loadEmployees();loadPermissions();showPage("attendancePage")}catch(err){console.error("Error cargando empleados:",err);$("employeeMessage").textContent="No se pudieron cargar los empleados. Revisa las reglas de Firestore."}});
