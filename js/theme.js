import {$} from "./state.js";

export function applyTheme(theme){const selected=theme==="dark"?"dark":"light";document.body.dataset.theme=selected;const btn=$("themeToggle");if(btn){btn.textContent=selected==="dark"?"☀ Modo claro":"☾ Modo nocturno";btn.setAttribute("aria-pressed",String(selected==="dark"));btn.setAttribute("aria-label",selected==="dark"?"Cambiar a modo claro":"Cambiar a modo nocturno")}try{localStorage.setItem("peopledesk-theme",selected)}catch(e){}}
try{applyTheme(localStorage.getItem("peopledesk-theme")||"light")}catch(e){applyTheme("light")}
$("themeToggle").addEventListener("click",()=>applyTheme(document.body.dataset.theme==="dark"?"light":"dark"));
