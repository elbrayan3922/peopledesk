/* Carga bajo demanda de librerías pesadas. La terminal pública ya no descarga la de Excel (cerca de 1 MB) si nadie exporta. */
const loading=new Map();
export function loadScript(url){
 if(!loading.has(url))loading.set(url,new Promise((res,rej)=>{const s=document.createElement("script");s.src=url;s.onload=res;s.onerror=()=>{loading.delete(url);rej(new Error("No se pudo descargar "+url))};document.head.appendChild(s)}));
 return loading.get(url);
}
export const XLSX_URL="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
export async function ensureXLSX(){if(window.XLSX)return true;try{await loadScript(XLSX_URL);return !!window.XLSX}catch(e){console.warn("[Excel]",e.message);return false}}
