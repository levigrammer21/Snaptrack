import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, deleteDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const cfg={apiKey:'AIzaSyAvfXlnSEyTmMmrxO91blwVt0jZeWWkyX0',authDomain:'snaptrak-44389.firebaseapp.com',projectId:'snaptrak-44389',storageBucket:'snaptrak-44389.firebasestorage.app',messagingSenderId:'8653895619',appId:'1:8653895619:web:d71b112539ea8b1dc6af76'};
export const app=initializeApp(cfg);
export const auth=getAuth(app);
export const db=getFirestore(app);
export const ADMIN_EMAIL='levigrammer@gmail.com';
export const TEAMS=['1/2','3/4','5/6'];
const norm=e=>(e||'').trim().toLowerCase();
export const userDoc=e=>doc(db,'users',norm(e));
export const accessDoc=e=>doc(db,'accessByEmail',norm(e));

export function listenAuth(cb){return onAuthStateChanged(auth,async user=>{if(user){await ensureUser(user); await ensureAdminAccess(user);} cb(user);});}
export async function login(email,pw){return signInWithEmailAndPassword(auth,email,pw)}
export async function createAccount(email,pw){const r=await createUserWithEmailAndPassword(auth,email,pw); await ensureUser(r.user); return r}
export async function googleLogin(){return signInWithPopup(auth,new GoogleAuthProvider())}
export async function resetPassword(email){return sendPasswordResetEmail(auth,email)}
export async function logout(){return signOut(auth)}
export async function ensureUser(user){const email=norm(user.email); if(!email)return; await setDoc(userDoc(email),{email,uid:user.uid,name:user.displayName||email.split('@')[0],lastSeen:serverTimestamp(),createdAt:serverTimestamp()}, {merge:true});}
export async function ensureAdminAccess(user){const email=norm(user.email); if(email===ADMIN_EMAIL){await setDoc(accessDoc(email),{email,admin:true,teams:{'1/2':true,'3/4':true,'5/6':true},updatedAt:serverTimestamp()}, {merge:true});}}
export async function getMyAccess(email){const e=norm(email); const snap=await getDoc(accessDoc(e)); if(e===ADMIN_EMAIL) return {email:e,admin:true,teams:{'1/2':true,'3/4':true,'5/6':true}}; return snap.exists()?snap.data():{email:e,admin:false,teams:{}};}
export async function loadUsers(){const s=await getDocs(query(collection(db,'users'),orderBy('email'))); return s.docs.map(d=>({id:d.id,...d.data()}));}
export async function loadAccesses(){const s=await getDocs(collection(db,'accessByEmail')); const out={}; s.docs.forEach(d=>out[d.id]=d.data()); return out;}
export async function saveAccess(email,data){await setDoc(accessDoc(email),{email:norm(email),...data,updatedAt:serverTimestamp()}, {merge:true});}
export function listenGames(cb){return onSnapshot(query(collection(db,'games'),orderBy('updatedAt','desc')),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))),err=>console.error(err));}
export function listenGame(id,cb){return onSnapshot(doc(db,'games',id),s=>s.exists()&&cb({id:s.id,...s.data()}));}
export async function createGame(data){const r=await addDoc(collection(db,'games'),{...data,plays:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()}); return r.id;}
export async function saveGame(id,data){await setDoc(doc(db,'games',id),{...data,updatedAt:serverTimestamp()}, {merge:true});}
export async function removeGame(id){await deleteDoc(doc(db,'games',id));}
export async function loadPresets(team){const s=await getDoc(doc(db,'presets',team.replace('/','-'))); return s.exists()?s.data():null;}
export async function savePresets(team,data){await setDoc(doc(db,'presets',team.replace('/','-')),{team,...data,updatedAt:serverTimestamp()}, {merge:true});}
export const nowIso=()=>new Date().toISOString();
