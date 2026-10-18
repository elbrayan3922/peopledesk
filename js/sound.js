/* Sonidos del lector.
 * 1) Si existen tus archivos en la carpeta /sounds, se usan esos (ver sounds/README.md).
 * 2) Si falta alguno, suena un tono suave tipo campana generado por el navegador. */
import {$} from "./state.js";

let audioContext=null,soundOn=true;
try{soundOn=localStorage.getItem("peopledesk-sound")!=="off"}catch(e){}

/* ===== Archivos de audio propios (carpeta /sounds) ===== */
const NAMES={success:"success",duplicate:"duplicate",error:"error",exit:"exit-alarm"}; // nombre del archivo, sin extensión
const EXTENSIONS=["mp3","wav","ogg"];                                                   // se prueban en este orden
const VOLUME={success:.8,duplicate:.7,error:.7,exit:.8};                                // 0 a 1
const EXIT_FILE_REPEATS=1;                                                              // veces que suena tu aviso de salida
const files={};                                                                         // sonido → <audio> disponible

function loadFile(key,i=0){
 if(i>=EXTENSIONS.length)return;                       // no hay archivo: se usará el tono generado
 const a=new Audio();a.preload="auto";a.volume=VOLUME[key];
 files[key]=a;
 a.addEventListener("error",()=>{if(files[key]===a)delete files[key];loadFile(key,i+1)},{once:true});
 a.src=`sounds/${NAMES[key]}.${EXTENSIONS[i]}`;
}
Object.keys(NAMES).forEach(k=>loadFile(k));

/* Reproduce el archivo propio; devuelve false si no existe para que se use el tono generado. */
function playFile(key,fallback){
 const a=files[key];if(!a)return false;
 try{a.currentTime=0;const p=a.play();if(p&&p.catch)p.catch(()=>{if(fallback)fallback()});return true}
 catch(e){return false}
}

function getAudioContext(){try{if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==="suspended")audioContext.resume().catch(()=>{});return audioContext}catch(e){return null}}

/* Una nota de campana: fundamental + dos armónicos tenues, ataque corto y caída exponencial. */
function bell(ctx,freq,start,duration,volume){
 const out=ctx.createGain();
 out.gain.setValueAtTime(0.0001,start);
 out.gain.exponentialRampToValueAtTime(volume,start+0.015);
 out.gain.exponentialRampToValueAtTime(0.0001,start+duration);
 out.connect(ctx.destination);
 [[1,1],[2,0.28],[3,0.08]].forEach(([mult,amp])=>{
  const osc=ctx.createOscillator(),g=ctx.createGain();
  osc.type="sine";osc.frequency.setValueAtTime(freq*mult,start);g.gain.value=amp;
  osc.connect(g);g.connect(out);osc.start(start);osc.stop(start+duration+0.05);
 });
}

/* [frecuencia Hz, retraso s, duración s, volumen] */
const SOUNDS={
 success:[[523.25,0,1.0,.15],[659.25,.09,1.0,.15],[783.99,.18,1.3,.16]], // do–mi–sol ascendente: lectura correcta
 duplicate:[[440,0,.35,.11],[440,.14,.5,.11]],                           // dos toques suaves: ya registrado
 error:[[329.63,0,.45,.12],[261.63,.16,.7,.12]]                          // dos notas descendentes: QR no válido
};
function playTone(type){
 const ctx=getAudioContext();if(!ctx)return;
 const t=ctx.currentTime+0.02;
 (SOUNDS[type]||SOUNDS.success).forEach(([f,d,dur,v])=>bell(ctx,f,t+d,dur,v));
}
export function playScanSound(type="success"){
 if(!soundOn)return;
 const key=SOUNDS[type]?type:"success";
 if(!playFile(key,()=>playTone(key)))playTone(key);
}

/* Aviso de hora de salida: tu archivo (exit-alarm) o, si no existe, tres campanadas suaves cada 6 s. */
function playExitTone(){
 const ctx=getAudioContext();if(!ctx)return;
 const t=ctx.currentTime+0.05;
 [[783.99,0],[659.25,.45],[523.25,.9]].forEach(([f,d])=>bell(ctx,f,t+d,1.6,.13));
}
export function playExitAlarm(gapMs=6000){
 const useFile=!!files.exit,total=useFile?EXIT_FILE_REPEATS:3;
 let n=0;
 const ring=()=>{
  if(!soundOn||n>=total)return;
  n++;
  if(useFile){if(!playFile("exit",playExitTone))playExitTone()}else playExitTone();
  if(n<total)setTimeout(ring,gapMs);
 };
 ring();
}

/* Los navegadores bloquean el audio hasta la primera interacción: se "desbloquea" con el primer toque o tecla. */
["pointerdown","keydown"].forEach(ev=>document.addEventListener(ev,()=>{getAudioContext()},{once:true}));

/* Botón para silenciar / activar el sonido (se recuerda en el navegador). */
function renderSoundToggle(){const b=$("soundToggle");if(!b)return;b.textContent=soundOn?"Sonido: activado":"Sonido: desactivado";b.setAttribute("aria-pressed",String(soundOn))}
$("soundToggle").addEventListener("click",()=>{
 soundOn=!soundOn;
 try{localStorage.setItem("peopledesk-sound",soundOn?"on":"off")}catch(e){}
 renderSoundToggle();
 if(soundOn)playScanSound("success");
});
renderSoundToggle();
