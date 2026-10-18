/* Inicialización de Firebase.
 * La apiKey de Firebase NO es un secreto: identifica el proyecto. La seguridad real está en firestore.rules. */

import {initializeApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {getFirestore,collection,getDocs,addDoc,updateDoc,doc,runTransaction,serverTimestamp,query,where,setDoc,getDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
const firebaseConfig={apiKey:"AIzaSyDv0uW_noBsgrlciNbe5R2wt51JrT2fijo",authDomain:"peopledesk-52d92.firebaseapp.com",projectId:"peopledesk-52d92",storageBucket:"peopledesk-52d92.firebasestorage.app",messagingSenderId:"933279518535",appId:"1:933279518535:web:81b58d9b4dacc815d00662"};
export const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
/* Inicio de sesión con Google. "select_account" siempre deja elegir la cuenta. */
export const googleProvider=new GoogleAuthProvider();
googleProvider.setCustomParameters({prompt:"select_account"});
export {signInWithPopup,signInWithRedirect,onAuthStateChanged,signOut,collection,getDocs,addDoc,updateDoc,doc,runTransaction,serverTimestamp,query,where,setDoc,getDoc};
