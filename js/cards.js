/* Tarjetas identificativas con QR. */
import {$,state} from "./state.js";

// Colores editables por departamento: cambia estos HEX según tu preferencia.
const departmentColors={
 "Gerencia General":"#4f46e5",
 "Recursos Humanos":"#be123c",
 "Finanzas y Contabilidad":"#047857",
 "Ventas":"#ea580c",
 "Compras e Inventario":"#0891b2",
 "Caja":"#a16207",
 "Proveedores Externos":"#65a30d"
};
const departmentBorders={
 "Gerencia General":"#3730a3",
 "Recursos Humanos":"#7f1d1d",
 "Finanzas y Contabilidad":"#065f46",
 "Ventas":"#9a3412",
 "Compras e Inventario":"#155e75",
 "Caja":"#713f12",
 "Proveedores Externos":"#3f6212"
};
function getDepartmentColor(department){
 const key=String(department||"").trim().toLocaleLowerCase("es");
 const match=Object.keys(departmentColors).find(name=>name.toLocaleLowerCase("es")===key);
 return match?departmentColors[match]:"#475569";
}
function getDepartmentBorder(department){
  const key=String(department||"").trim().toLocaleLowerCase("es");
  const match=Object.keys(departmentBorders).find(name=>name.toLocaleLowerCase("es")===key);
  return match?departmentBorders[match]:"#334155";
}
export function renderCards(){const grid=$("cardsGrid");grid.replaceChildren();if(!state.employees.length){$("cardsMessage").textContent="No hay empleados registrados.";return}$("cardsMessage").textContent="";state.employees.forEach(emp=>{const color=getDepartmentColor(emp.department);const card=document.createElement("div");card.className=`employee-card${String(emp.department||"").trim().toLocaleLowerCase("es")==="recursos humanos"?" hr-card":""}`;
card.style.setProperty("--dept-color",color);
card.style.setProperty("--dept-border",getDepartmentBorder(emp.department));const head=document.createElement("div");head.className="employee-card-header";const kicker=document.createElement("div");kicker.className="card-kicker";kicker.textContent="Identificación institucional";const brand=document.createElement("div");brand.className="institution";brand.textContent="INVAS 2A";const deptHead=document.createElement("div");deptHead.className="card-dept";deptHead.textContent=emp.department||"Departamento";head.append(kicker,brand,deptHead);const body=document.createElement("div");body.className="employee-card-body";const qr=document.createElement("div");qr.className="qr-image";qr.setAttribute("aria-label","Código QR del empleado");const nameLabel=document.createElement("p");nameLabel.className="field-label";nameLabel.textContent="Nombre completo";const name=document.createElement("h3");name.textContent=emp.name||"";const positionLabel=document.createElement("p");positionLabel.className="field-label";positionLabel.textContent="Puesto";const position=document.createElement("p");position.className="position";position.textContent=emp.position||"";const department=document.createElement("p");department.className="department";department.textContent=emp.department||"Sin departamento";const code=document.createElement("div");code.className="employee-code";code.textContent=emp.code||"";body.append(qr,nameLabel,name,positionLabel,position,department);card.append(head,body,code);grid.appendChild(card);if(window.QRCode&&emp.qrToken){
  // Limpieza defensiva: una sola representación del QR por tarjeta.
  qr.replaceChildren();
  new window.QRCode(qr,{text:String(emp.qrToken),width:132,height:132,correctLevel:window.QRCode.CorrectLevel.M});
  const qrCanvas=qr.querySelector("canvas");
  const qrImg=qr.querySelector("img");
  if(qrCanvas){
    if(qrImg)qrImg.remove();
    qrCanvas.style.setProperty("display","block","important");
    qrCanvas.style.setProperty("width","132px","important");
    qrCanvas.style.setProperty("height","132px","important");
  }else if(qrImg){
    qrImg.style.setProperty("display","block","important");
    qrImg.style.setProperty("width","132px","important");
    qrImg.style.setProperty("height","132px","important");
  }else{
    qr.textContent="No se pudo generar el QR.";
  }
}else qr.textContent="No se pudo generar el QR."})}
$("printCards").addEventListener("click",()=>window.print());
