/* Hora oficial de El Salvador (UTC−6, sin horario de verano), corregida con la hora del SERVIDOR.
 * Así un reloj mal puesto en la computadora o el celular no altera las marcas.
 * Cómo: se lee la cabecera HTTP "Date" del propio sitio (misma web, sin permisos extra) y se guarda la diferencia.
 * Si no se puede sincronizar, se usa el reloj del equipo y la terminal lo avisa. */
let offset=0,synced=false,lastSync=0,lastError="";
export const nowMs=()=>Math.round(Date.now()+offset);   // entero: las reglas de Firestore exigen un número entero
export const nowDate=()=>new Date(nowMs());
export const clockInfo=()=>({offsetMs:offset,synced,lastSync,lastError});
export async function syncClock(){
 if(!/^https?:$/.test(location.protocol)){lastError="Sin servidor (archivo local)";return false}
 try{
  const t0=Date.now(),r=await fetch(location.pathname+"?sync="+t0,{method:"HEAD",cache:"no-store"}),t1=Date.now(),d=r.headers.get("date");
  if(!d)throw new Error("El servidor no envía la cabecera Date");
  /* La cabecera Date tiene precisión de 1 s (se trunca): se suma medio segundo, más la edad en caché y la mitad del viaje. */
  const server=Date.parse(d)+500+(Number(r.headers.get("age"))||0)*1000+(t1-t0)/2;
  if(!Number.isFinite(server)||Math.abs(server-t1)>30*86400000)throw new Error("Hora del servidor fuera de rango");
  offset=server-t1;synced=true;lastSync=t1;lastError="";return true;
 }catch(e){lastError=String(e&&e.message||e);synced=false;console.warn("[Reloj] No se pudo sincronizar con el servidor:",lastError);return false}
}
export function startClockSync(onChange){
 const run=async()=>{await syncClock();if(onChange)onChange()};
 run();setInterval(run,10*60*1000);
}
