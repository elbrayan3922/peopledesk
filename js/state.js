/* Estado y utilidades compartidas. `state` es un objeto porque los `let` importados no se pueden reasignar. */

export const $=id=>document.getElementById(id);
export const TZ="America/El_Salvador";
export const state={employees:[],attendance:[],permissions:[],currentUser:null,currentMethod:"qr",scanner:null,scanSequence:0,resultTimeout:null};
