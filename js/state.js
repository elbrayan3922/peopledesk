/* Estado y utilidades compartidas. `state` es un objeto porque los `let` importados no se pueden reasignar. */

export const $=id=>document.getElementById(id);
export const TZ="America/El_Salvador";
export const state={employees:[],attendance:[],permissions:[],consents:{},backupMeta:null,role:null,currentUser:null,settings:null,config:null,currentMethod:"qr",scanner:null,scanSequence:0,resultTimeout:null};

export const APP_VERSION="4.1.1";
/* Permisos por rol: admin (todo), rrhh (empleados, permisos, horarios, planilla) y consulta (solo lectura). */
export const can={hr:()=>state.role==="admin"||state.role==="rrhh",admin:()=>state.role==="admin"};
export const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
