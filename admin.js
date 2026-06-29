import { TEAMS, ADMIN_EMAIL, loadUsers, saveAccess } from './firebase.js';
const norm=e=>(e||'').trim().toLowerCase();
export async function renderAdmin({currentUser, accessCache, container, toast}){
  const users=await loadUsers();
  const emails=new Set([ADMIN_EMAIL,currentUser.email,...users.map(u=>u.email),...Object.keys(accessCache||{})]);
  container.innerHTML=[...emails].sort().map(email=>personCard(email,accessCache[email]||{email,teams:{},admin:email===ADMIN_EMAIL})).join('');
  container.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=async()=>{const email=btn.closest('.person').dataset.email; const key=btn.dataset.toggle; const a=accessCache[email]||{email,teams:{}}; if(key==='admin')a.admin=!a.admin; else a.teams={...(a.teams||{}),[key]:!(a.teams||{})[key]}; if(email===ADMIN_EMAIL){a.admin=true; a.teams={'1/2':true,'3/4':true,'5/6':true};}
    accessCache[email]=a; await saveAccess(email,a); toast('Access updated'); await renderAdmin({currentUser,accessCache,container,toast}); });
}
function personCard(email,a){const initials=email.slice(0,1).toUpperCase(); return `<div class="person game-card" data-email="${email}"><div style="display:flex;gap:10px;align-items:center"><div class="mini-logo">${initials}</div><div><h3>${email}</h3><div class="subline">${a.admin?'Admin':'Coach'}</div></div></div><div class="chip-grid" style="margin-top:10px"><button class="chip ${a.admin?'on':''}" data-toggle="admin">Admin</button>${TEAMS.map(t=>`<button class="chip ${(a.teams||{})[t]?'on':''}" data-toggle="${t}">${t}</button>`).join('')}</div></div>`;}
export async function addManualUser(email, accessCache, toast){email=norm(email); if(!email)return; accessCache[email]=accessCache[email]||{email,admin:false,teams:{}}; await saveAccess(email,accessCache[email]); toast('User added');}
