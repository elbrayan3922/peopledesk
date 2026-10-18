/* Consola en pantalla: captura console.* y errores globales. Para quitarla, borra este bloque y el CSS "v2 · consola de registros". */
(function(){
  var MAX=300,logs=[],panel=null,list=null,toggle=null,badge=null,unseen=0;
  function fmt(a){
    if(a instanceof Error||(a&&typeof a==="object"&&typeof a.message==="string"&&typeof a.name==="string"))return a.stack||(a.name+": "+a.message);
    if(typeof a==="string")return a;
    if(a===undefined)return "undefined";
    try{var s=JSON.stringify(a);return s===undefined?String(a):s}catch(e){return String(a)}
  }
  function stamp(){return new Date().toLocaleTimeString("en-GB",{hour12:false,timeZone:"America/El_Salvador"})}
  function isOpen(){return !!panel&&!panel.hidden}
  function addLine(entry){
    if(!list)return;
    var empty=list.querySelector(".dc-empty");if(empty)empty.remove();
    var stick=list.scrollTop+list.clientHeight>=list.scrollHeight-24;
    var row=document.createElement("div");row.className="dc-line dc-"+entry.level;
    var t=document.createElement("time");t.textContent=entry.t;
    row.append(t,document.createTextNode(entry.msg));
    list.appendChild(row);
    while(list.children.length>MAX)list.removeChild(list.firstChild);
    if(stick)list.scrollTop=list.scrollHeight;
  }
  function push(level,args){
    var msg=Array.prototype.map.call(args,fmt).join(" ");
    if(msg.length>2000)msg=msg.slice(0,2000)+"…";
    var entry={t:stamp(),level:level,msg:msg};
    logs.push(entry);if(logs.length>MAX)logs.shift();
    addLine(entry);
    if((level==="error"||level==="warn")&&!isOpen()&&badge){unseen++;badge.textContent=unseen>99?"99+":String(unseen);badge.hidden=false}
  }
  ["log","info","warn","error","debug"].forEach(function(level){
    var original=console[level];
    console[level]=function(){try{push(level,arguments)}catch(e){}return original.apply(console,arguments)};
  });
  window.addEventListener("error",function(e){
    var t=e.target;
    if(t&&t!==window&&(t.src||t.href))push("error",["No se pudo cargar el recurso: "+(t.src||t.href)]);
    else push("error",[(e.message||"Error desconocido")+(e.filename?" ("+String(e.filename).split("/").pop()+":"+e.lineno+")":"")]);
  },true);
  window.addEventListener("unhandledrejection",function(e){push("error",["Promesa rechazada: "+fmt(e.reason)])});
  function copyLogs(btn){
    var text=logs.map(function(l){return "["+l.t+"] "+l.level.toUpperCase()+" "+l.msg}).join("\n");
    function done(ok){var old=btn.textContent;btn.textContent=ok?"Copiado":"No se pudo copiar";setTimeout(function(){btn.textContent=old},1500)}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true)},function(){done(false)});return}
    try{var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();var ok=document.execCommand("copy");ta.remove();done(ok)}catch(e){done(false)}
  }
  function setOpen(v){
    panel.hidden=!v;toggle.setAttribute("aria-expanded",String(v));
    if(v){unseen=0;badge.hidden=true;list.scrollTop=list.scrollHeight}
  }
  function build(){
    toggle=document.createElement("button");toggle.id="devConsoleToggle";toggle.type="button";toggle.className="no-print admin-only";
    toggle.setAttribute("aria-controls","devConsole");toggle.setAttribute("aria-expanded","false");
    toggle.append(document.createTextNode("Consola"));
    badge=document.createElement("span");badge.hidden=true;badge.textContent="0";toggle.appendChild(badge);
    panel=document.createElement("div");panel.id="devConsole";panel.className="no-print admin-only";panel.hidden=true;panel.setAttribute("role","region");panel.setAttribute("aria-label","Consola de registros");
    var head=document.createElement("div");head.className="dc-head";
    var title=document.createElement("strong");title.textContent="Consola de registros";
    var bCopy=document.createElement("button");bCopy.type="button";bCopy.textContent="Copiar";
    var bClear=document.createElement("button");bClear.type="button";bClear.textContent="Limpiar";
    var bClose=document.createElement("button");bClose.type="button";bClose.textContent="Cerrar";
    head.append(title,bCopy,bClear,bClose);
    list=document.createElement("div");list.id="devConsoleList";
    panel.append(head,list);
    document.body.append(panel,toggle);
    toggle.addEventListener("click",function(){setOpen(panel.hidden)});
    bClose.addEventListener("click",function(){setOpen(false)});
    bCopy.addEventListener("click",function(){copyLogs(bCopy)});
    bClear.addEventListener("click",function(){logs.length=0;list.replaceChildren();var e=document.createElement("div");e.className="dc-empty";e.textContent="Sin registros.";list.appendChild(e)});
    if(logs.length)logs.forEach(addLine);
    else{var e=document.createElement("div");e.className="dc-empty";e.textContent="Sin registros todavía.";list.appendChild(e)}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",build);else build();
})();
