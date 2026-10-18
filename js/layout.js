/* Estructura del panel: títulos por sección, migas de pan y menú lateral en móvil. */
import {$} from "./state.js";

const PAGES={
 dashboardPage:["Panel de control","Resumen del día: asistencia, puntualidad y permisos."],
 attendancePage:["Asistencia","Registra entradas y salidas con QR, de forma manual, con biometría o con el rostro."],
 employeesPage:["Empleados","Alta y directorio del personal."],
 cardsPage:["Tarjetas QR","Tarjetas identificativas listas para imprimir."],
 permissionsPage:["Permisos","Permisos personales y su estado."],
 orgChartPage:["Organigrama","Estructura de la organización."]
};

export function updateChrome(id){
 const p=PAGES[id];if(!p)return;
 $("pageTitle").textContent=p[0];$("pageSubtitle").textContent=p[1];$("crumbPage").textContent=p[0];
}

function setOpen(open){
 document.body.classList.toggle("nav-open",open);
 $("menuToggle").setAttribute("aria-expanded",String(open));
}
$("menuToggle").addEventListener("click",()=>setOpen(!document.body.classList.contains("nav-open")));
$("sideOverlay").addEventListener("click",()=>setOpen(false));
document.querySelectorAll(".side-nav .tab").forEach(b=>b.addEventListener("click",()=>setOpen(false)));
document.addEventListener("keydown",e=>{if(e.key==="Escape")setOpen(false)});
