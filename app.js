import { TEAMS, listenAuth, login, createAccount, googleLogin, resetPassword, logout, getMyAccess, loadAccesses, listenGames, listenGame, createGame, saveGame, removeGame, loadPresets, savePresets, nowIso } from './firebase.js';
import { gameStats, seasonStats, boxscoreHtml, gameCsv, seasonCsv, download } from './stats.js';
import { renderAdmin, addManualUser } from './admin.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const APP_VERSION='1.3.1';
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
let lastTouchAt=0;
function bindTap(containerSelector, cardSelector, handler){
  const el=$(containerSelector);
  if(!el)return;
  let gesture=null;
  const reset=()=>{gesture=null;};
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const card=e.target.closest(cardSelector);
    if(!card||!el.contains(card))return;
    gesture={pointerId:e.pointerId,card,x:e.clientX,y:e.clientY,moved:false};
  });
  el.addEventListener('pointermove',e=>{
    if(!gesture||gesture.pointerId!==e.pointerId)return;
    if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>10)gesture.moved=true;
  });
  el.addEventListener('pointercancel',reset);
  el.addEventListener('pointerup',e=>{
    if(!gesture||gesture.pointerId!==e.pointerId)return;
    const g=gesture; reset();
    const card=e.target.closest(cardSelector);
    if(g.moved||card!==g.card)return;
    lastTouchAt=Date.now();
    handler(card,e);
  });
  el.addEventListener('click',e=>{
    if(Date.now()-lastTouchAt<500)return;
    const card=e.target.closest(cardSelector);
    if(!card||!el.contains(card))return;
    handler(card,e);
  });
}
let suppressStatModalClicksUntil=0;
const statModalEl=$('#statModal');
if(statModalEl)statModalEl.addEventListener('click',e=>{
  if(Date.now()<suppressStatModalClicksUntil){e.preventDefault();e.stopImmediatePropagation();}
},true);
const colors=['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2'];
const baseGroups={offense:{name:'Offense',color:'#2563eb',players:[]},defense:{name:'Defense',color:'#16a34a',players:[]},kickoff:{name:'Kickoff',color:'#d97706',players:[]},kickReturn:{name:'Kick Return',color:'#0891b2',players:[]},special:{name:'Special',color:'#7c3aed',players:[]},secondTeam:{name:'2nd Team',color:'#64748b',players:[]}};
const ROSTERS={
 '1/2':[
  ['7','Ronin Massey'],['8','Brooks Grill'],['11','Legend Griffin'],['14','Urban Niemann'],['16','Carson Russell'],['18','Kace Hilbert'],['21','Reid Grammer'],['22','Caston Hamilton'],['24','Niko Grant'],['40','Ledger Johnson'],['42','Reece Fasching'],['55','Russ Pearman'],['66','Dillon Campbell'],['67','Jamesyn Cullum'],['93','Phoneix Brackeen'],['99','Waylon Lyon']
 ],
 '3/4':[
  ['0','Jelani Drew'],['1','Jorden McElvany'],['3','Lincoln Eskridge'],['4','Brock Monson'],['5','Braxton Bailey'],['6','Zayn Sanders'],['7','Gunner Williams'],['8','Evan Grammer'],['9','Rollin Sanders'],['10','Landry Eskridge'],['11','Gaviston Clark'],['13','Sawyer Redd'],['15','Jessen Cullum'],['17','Colton Meadows'],['18','Ellis Seward'],['20','Kayden Williams'],['21','Carter McElvany'],['22','Liam George'],['25','Jaxon Beck'],['27','Conrad Pennington'],['28','Logan Wells'],['33','Logan Grotts'],['37','Purpose Birchmier'],['41','Carson Burleson'],['44','Jaiden Palmer'],['67','James Wright'],['89','Jasper Maples'],['93','Boston McKnight'],['99','Kaydin Mash']
 ],
 '5/6':[ ['1','Aiden Turner'],['2','Brayden Lewis'],['3','Camden Moore'],['4','Declan Ross'],['5','Emmett Ward'],['6','Finn Hughes'],['7','Gavin Price'],['8','Hayden Bell'],['9','Isaac Coleman'],['10','Jack Morgan'],['11','Kai Bennett'],['12','Logan Foster'],['13','Myles Perry'],['14','Noah Sanders'],['15','Parker Wood'],['16','Ryder Green'] ]
};

function roster(team){return (ROSTERS[team]||[]).map((r,i)=>({id:`${team}-${r[0]}`,num:r[0],name:r[1],absent:false,idx:i}));}
function validPlayerIds(team=state.current?.team||state.team){return new Set(roster(team).map(p=>p.id));}
function sanitizedPlayerIds(ids,team=state.current?.team||state.team){const valid=validPlayerIds(team); return [...new Set(ids||[])].filter(id=>valid.has(id));}
function sanitizeGroups(groups,team=state.team){
  const out=structuredClone(baseGroups);
  for(const [key,group] of Object.entries(groups||{})){
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(key)||!group||typeof group!=='object')continue;
    const fallback=out[key]||{name:'Custom Preset',color:colors[Object.keys(out).length%colors.length],players:[]};
    out[key]={
      name:String(group.name||fallback.name).trim().slice(0,40)||fallback.name,
      color:colors.includes(group.color)?group.color:fallback.color,
      players:sanitizedPlayerIds(group.players,team)
    };
  }
  return out;
}
function sanitizeFieldSelection(team=state.current?.team||state.team){state.selected=new Set(sanitizedPlayerIds([...state.selected],team)); return state.selected;}
let state={user:null,access:null,accessCache:{},games:[],team:'1/2',page:'game',phase:'offense',current:null,selected:new Set(),groups:structuredClone(baseGroups),editGroup:'offense',dirty:false,lastCloudUpdate:null,unsubGame:null,stat:{},editingPlayId:null,editingPlayIndex:null};
let presetSaveTimer=null;
function schedulePresetSave(){const team=state.team,groups=structuredClone(state.groups); clearTimeout(presetSaveTimer); setSaveStatus('saving'); presetSaveTimer=setTimeout(async()=>{try{await savePresets(team,{groups});setSaveStatus(state.dirty?'dirty':'saved');}catch(e){console.error(e);setSaveStatus('offline');}},300);}

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),1600)}
function setSaveStatus(s){const el=$('#saveStatus'); el.className='save-pill '+s; el.textContent={saved:'Saved',saving:'Saving...',dirty:'Unsaved',offline:'Offline'}[s]||s;}
function draftKey(id=state.current?.id){return id&&state.user?.uid?`snaptrack:draft:${state.user.uid}:${id}`:null;}
function persistDraft(){const key=draftKey(); if(!key||!state.current)return; try{localStorage.setItem(key,JSON.stringify({game:state.current,selected:[...state.selected],savedAt:Date.now()}));}catch(e){console.error('Local draft save failed',e);}}
function readDraft(id){const key=draftKey(id); if(!key)return null; try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function clearDraft(id=state.current?.id){const key=draftKey(id); if(key)localStorage.removeItem(key);}
function markDirty(){state.dirty=true; persistDraft(); setSaveStatus(navigator.onLine?'dirty':'offline');}
function withTimeout(promise,ms=8000){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Save timed out')),ms))]);}
async function cloudSave(reason='save'){
  if(!state.current?.id)return false;
  state.current.updatedBy=state.user.uid;
  state.current.updatedByEmail=state.user.email;
  markDirty();
  if(!navigator.onLine){setSaveStatus('offline');return false;}
  try{
    setSaveStatus('saving');
    await withTimeout(saveGame(state.current.id,cleanGame(state.current)));
    state.dirty=false;
    clearDraft();
    setSaveStatus('saved');
    return true;
  }catch(e){console.error(`${reason} save failed`,e);persistDraft();setSaveStatus('offline');return false;}
}
function cleanGame(g){const {id,...rest}=g; return rest;}
function allowedTeams(){if(state.access?.admin)return TEAMS; return TEAMS.filter(t=>state.access?.teams?.[t]);}
function canUseTeam(t){return state.access?.admin||!!state.access?.teams?.[t];}
function requiredPlayers(team=state.team){return team==='1/2'?8:11;}
function fieldReady(){if(!state.current||state.current.status==='ended')return false; sanitizeFieldSelection(state.current.team||state.team); return state.selected.size===requiredPlayers(state.current.team||state.team);}
function fieldReadyMessage(){const req=requiredPlayers(state.current?.team||state.team); return `Need exactly ${req} players on the field before recording a snap.`;}

listenAuth(async user=>{state.user=user; if(user){document.body.classList.remove('auth-lock'); $('#authScreen').classList.add('hidden'); state.access=await getMyAccess(user.email); state.accessCache=await loadAccesses(); $('#peopleBtn').classList.toggle('hidden',!state.access.admin); state.team=allowedTeams()[0]||'1/2'; await loadTeamPresets(); wireGameListener(); renderAll();} else {document.body.classList.add('auth-lock'); $('#authScreen').classList.remove('hidden');}});
function wireGameListener(){listenGames(games=>{state.games=games; renderSeason(); renderGames(); renderLiveResume();});}
async function loadTeamPresets(){const p=await loadPresets(state.team); state.groups=sanitizeGroups(p?.groups,state.team);}

let creating=false; $('#loginTab').onclick=()=>{creating=false;$('#loginTab').classList.add('on');$('#createTab').classList.remove('on');$('#authSubmit').textContent='Sign In'}; $('#createTab').onclick=()=>{creating=true;$('#createTab').classList.add('on');$('#loginTab').classList.remove('on');$('#authSubmit').textContent='Create Account'};
$('#authSubmit').onclick=async()=>{try{$('#authError').classList.add('hidden'); const e=$('#authEmail').value,p=$('#authPassword').value; creating?await createAccount(e,p):await login(e,p);}catch(err){$('#authError').textContent=err.message;$('#authError').classList.remove('hidden')}};
$('#googleBtn').onclick=async()=>{try{await googleLogin()}catch(e){toast(e.message)}}; $('#forgotBtn').onclick=async()=>{const e=$('#authEmail').value; if(!e)return toast('Enter email first'); await resetPassword(e); toast('Reset email sent')}; $('#logoutBtn').onclick=logout;
$('#themeBtn').onclick=()=>{document.body.classList.toggle('sun'); localStorage.snapTheme=document.body.classList.contains('sun')?'sun':'dark'}; if(localStorage.snapTheme==='sun')document.body.classList.add('sun');

$$('.tabs button').forEach(b=>b.onclick=()=>{state.page=b.dataset.page; renderPages();});
function renderPages(){$$('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.page===state.page)); $$('.page').forEach(p=>p.classList.remove('on')); $(`#page-${state.page}`).classList.add('on'); renderAll();}

function renderAll(){renderTeams(); renderGame(); renderRoster(); renderSeason(); renderGames(); renderTimeline(); renderHeader();}
function renderHeader(){const g=state.current; document.title=`SnapTrack v${APP_VERSION}`; const footer=document.querySelector('.footer'); if(footer) footer.textContent=`SnapTrack v${APP_VERSION}`; $('#subline').textContent=g?`${g.team} · ${g.name||'Live Game'}${g.scrimmage?' · SCRIMMAGE':''} · Play ${(g.plays||[]).length}`:`${state.team} · ${state.user?.email||''}`; $('#liveBadge').textContent=g&&g.status!=='ended'?'● Live':g?.status==='ended'?'Ended':'No Live Game'; $('#liveBadge').classList.toggle('off',!g||g.status==='ended'); $('#snapDock').classList.toggle('hidden',!g||g.status==='ended'); $('#gameTools').classList.toggle('hidden',!g||g.status==='ended'); $('#setupCard').classList.toggle('hidden',!!g&&g.status!=='ended');}
function renderTeams(){const html=TEAMS.map(t=>`<button class="team-card ${state.team===t?'on':''}" data-team="${t}" ${canUseTeam(t)?'':'disabled'}><b>${t}</b><span>${canUseTeam(t)?'Available':'Locked'}</span></button>`).join(''); $('#teamCards').innerHTML=html; $$('#teamCards [data-team]').forEach(b=>b.onclick=async()=>{if(!canUseTeam(b.dataset.team))return; state.team=b.dataset.team; await loadTeamPresets(); renderAll();}); $('#rosterTitle').textContent=`${state.team} Roster`;}
function renderGame(){sanitizeFieldSelection(); renderLiveResume(); renderGroups('#loadGroups',false); renderPlayers(); const g=state.current; const req=requiredPlayers(g?.team||state.team); const stats=g?gameStats(g,roster(g.team)):null; $('#fieldCount').textContent=`${state.selected.size}/${req}`; $('#snapCount').textContent=(g?.plays||[]).length; $('#dockSnaps').textContent=(g?.plays||[]).length; $('#underCount').textContent=stats?stats.players.filter(p=>p.snaps<5).length:0; $('#snapBtn').disabled=!fieldReady(); $('#snapBtn').title=fieldReady()?'Record snap':fieldReadyMessage(); $$('.seg [data-phase]').forEach(b=>b.classList.toggle('on',b.dataset.phase===state.phase));}
function renderLiveResume(){const lives=state.games.filter(g=>g.status==='live'&&canUseTeam(g.team)&&g.id!==state.current?.id); const box=$('#liveResume'); if(!lives.length){box.classList.add('hidden');return;} box.classList.remove('hidden'); box.innerHTML=`<div class="section-kicker">🟢 ${lives.length} Other Live Game${lives.length===1?'':'s'}</div>${lives.map(live=>`<div class="live-game-row"><div><h2>${escapeHtml(live.team)} ${escapeHtml(live.name||'')}</h2><p class="subline">Play ${(live.plays||[]).length} · Last updated ${escapeHtml(live.updatedByEmail||'coach')}</p></div><button class="btn primary" data-resume-live="${escapeHtml(live.id)}">Resume</button></div>`).join('')}`; box.querySelectorAll('[data-resume-live]').forEach(btn=>btn.onclick=()=>openGame(lives.find(g=>g.id===btn.dataset.resumeLive)));}
async function startGame(practice=false){if(!canUseTeam(state.team))return toast('No access to this team'); const name=$('#gameName').value|| (practice?'Practice':'Game'); const scrimmage=!!$('#scrimmageGame')?.checked; const id=await createGame({team:state.team,name,mode:practice?'practice':'game',scrimmage,status:'live',date:nowIso(),plays:[],groups:state.groups,createdBy:state.user.uid,createdByEmail:state.user.email,updatedBy:state.user.uid,updatedByEmail:state.user.email}); const g={id,team:state.team,name,mode:practice?'practice':'game',scrimmage,status:'live',date:nowIso(),plays:[],groups:state.groups}; openGame(g); toast(scrimmage?'Scrimmage started — excluded from season stats':'Game started');}
$('#startGameBtn').onclick=()=>startGame(false); $('#practiceBtn').onclick=()=>startGame(true);
function openGame(g){const draft=readDraft(g.id); const useDraft=draft?.game&&((draft.game.plays||[]).length>(g.plays||[]).length||draft.game.status!==g.status); state.current=JSON.parse(JSON.stringify(useDraft?draft.game:g)); state.team=state.current.team; state.groups=sanitizeGroups(state.current.groups||state.groups,state.team); state.current.groups=state.groups; state.selected=new Set(sanitizedPlayerIds(useDraft?(draft.selected||[]):[],state.team)); state.dirty=!!useDraft; if(useDraft){setSaveStatus(navigator.onLine?'dirty':'offline');toast('Recovered unsaved local scoring');} state.lastCloudUpdate=g.updatedAt?.seconds||Date.now()/1000; if(state.unsubGame)state.unsubGame(); state.unsubGame=listenGame(g.id,cg=>{if(!state.current||cg.id!==state.current.id)return; const stamp=cg.updatedAt?.seconds||0; const localByMe=cg.updatedBy===state.user.uid; if(stamp>state.lastCloudUpdate+1 && !localByMe){$('#conflictBanner').classList.remove('hidden'); $('#reloadCloudBtn').onclick=()=>{state.current=JSON.parse(JSON.stringify(cg)); state.lastCloudUpdate=stamp; $('#conflictBanner').classList.add('hidden'); renderAll();};} state.lastCloudUpdate=Math.max(state.lastCloudUpdate,stamp);}); state.page='game'; renderPages();}

$$('[data-phase]').forEach(b=>b.onclick=()=>{state.phase=b.dataset.phase; renderGame();});
function renderGroups(sel, edit){const el=$(sel); el.innerHTML=Object.entries(state.groups).map(([k,g])=>`<button class="chip ${edit?state.editGroup===k?'on':'': ''}" data-grp="${escapeHtml(k)}" style="border-color:${g.color};"><span>${escapeHtml(g.name)}</span><small>${g.players.length} players</small></button>`).join(''); el.querySelectorAll('[data-grp]').forEach(b=>b.onclick=()=>{const k=b.dataset.grp; if(edit){state.editGroup=k; renderRoster();} else {state.selected=new Set(sanitizedPlayerIds(state.groups[k].players,state.current?.team||state.team)); renderGame();}});}
function renderPlayers(){const list=roster(state.team); const q=($('#playerSearch').value||'').toLowerCase(); $('#gamePlayers').innerHTML=list.filter(p=>!q||p.name.toLowerCase().includes(q)||p.num.includes(q)).map(p=>playerHtml(p,state.selected.has(p.id),snapCount(p.id))).join('');}
function snapCount(id){return (state.current?.plays||[]).filter(pl=>(pl.players||[]).includes(id)).length;}
function playerHtml(p,sel,count){return `<div class="player-card ${sel?'sel':''}" data-id="${p.id}"><div class="pnum">${p.num}</div><div class="pinfo"><div class="pname">${p.name}</div><div class="psub">${groupNamesFor(p.id).join(' · ')||'No group'}</div></div><div class="pstat">${count}</div></div>`;}
function groupNamesFor(id){return Object.values(state.groups).filter(g=>g.players.includes(id)).map(g=>g.name);}
$('#playerSearch').oninput=renderPlayers; $('#clearFieldBtn').onclick=()=>{state.selected.clear(); renderGame();}; $('#manualSaveBtn').onclick=()=>cloudSave('manual');
$('#endGameBtn').onclick=async()=>{if(!state.current)return; state.current.status='ended'; await cloudSave('end'); toast('Game ended'); renderAll();};
$('#quickUndoBtn').onclick=undoSnap; $('#snapBtn').onclick=()=>{if(!fieldReady())return toast(fieldReadyMessage()); openStatModal();};
function undoSnap(){if(!state.current?.plays?.length)return; state.current.plays.pop(); markDirty(); cloudSave('undo'); renderAll(); toast('Last snap undone');}
function openStatModal(){
  state.editingPlayId=null;
  state.editingPlayIndex=null;
  state.stat={type:state.phase==='defense'?'defense':'run',yards:0,defYards:0,players:[...state.selected],phase:state.phase,result:'',touchdown:false,fumble:false,deadSnap:false,defResult:'',primary:null,receiver:null,tackler:null,assist:null};
  $('#statModal').classList.remove('hidden');
  renderStatModal();
}
function openEditPlay(playIndex){
  if(!state.current)return;
  const idx=Number(playIndex);
  const pl=(state.current.plays||[])[idx];
  if(!pl)return toast('Play not found');
  state.editingPlayIndex=idx;
  state.editingPlayId=pl.id||null;
  state.stat={
    type:pl.type||'snap',yards:Number(pl.yards||0),defYards:Number(pl.defYards??pl.yards??0),
    players:sanitizedPlayerIds(pl.players||[],state.current.team),phase:pl.phase||'offense',result:pl.result||'',
    touchdown:!!pl.touchdown,fumble:!!pl.fumble,deadSnap:!!pl.deadSnap,defResult:pl.defResult||'',
    primary:pl.primary||null,receiver:pl.receiver||null,tackler:pl.tackler||null,assist:pl.assist||null
  };
  suppressStatModalClicksUntil=Date.now()+350;
  $('#statModal').classList.remove('hidden');
  renderStatModal();
}
function editPlayers(){return new Set(sanitizedPlayerIds(state.stat.players||[],state.current?.team||state.team));}
function renderStatModal(){
  const st=state.stat;
  const editing=Number.isInteger(state.editingPlayIndex);
  const onField=editing?editPlayers():new Set([...state.selected]);
  const req=requiredPlayers(state.current?.team||state.team);
  $('#statTitle').textContent=editing?`Edit Play #${(state.current.plays||[])[state.editingPlayIndex]?.num||state.editingPlayIndex+1}`:`Play #${(state.current.plays||[]).length+1}`;
  $('#statSub').textContent=`${String(st.phase||state.phase).toUpperCase()} · ${onField.size}/${req} players${editing?' · changes recalculate game + season stats':''}`;
  $('#editPlayersBlock').classList.toggle('hidden',!editing);
  if(editing){
    $('#editPlayersGrid').innerHTML=roster(state.team).map(p=>`<button class="mini-player ${onField.has(p.id)?'on':''}" data-edit-field-player="${p.id}">#${p.num}<br>${escapeHtml(p.name.split(' ')[0])}</button>`).join('');
    $$('#editPlayersGrid [data-edit-field-player]').forEach(b=>b.onclick=()=>{
      const set=editPlayers(),id=b.dataset.editFieldPlayer;
      set.has(id)?set.delete(id):set.add(id);
      st.players=[...set];
      ['primary','receiver','tackler','assist'].forEach(k=>{if(st[k]&&!set.has(st[k]))st[k]=null;});
      renderStatModal();
    });
  }
  const defense=st.phase==='defense';
  $('#offStats').classList.toggle('hidden',defense);
  $('#defStats').classList.toggle('hidden',!defense);
  $('.stat-type').classList.toggle('hidden',defense);
  $$('.stat-type [data-ptype]').forEach(b=>b.classList.toggle('on',b.dataset.ptype===st.type));
  $('#receiverBlock').classList.toggle('hidden',st.type!=='pass');
  $('#yardsInput').value=st.yards||0;
  $$('#quickYards [data-yard]').forEach(b=>b.classList.toggle('on',Number(b.dataset.yard)===Number(st.yards||0)));
  $('#defYardsInput').value=st.defYards||0;
  $$('#defQuickYards [data-def-yard]').forEach(b=>b.classList.toggle('on',Number(b.dataset.defYard)===Number(st.defYards||0)));
  const players=roster(state.team).filter(p=>onField.has(p.id));
  const mini=(target,field)=>{$(target).innerHTML=players.map(p=>`<button class="mini-player ${st[field]===p.id?'on':''}" data-pick="${field}" data-id="${p.id}">#${p.num}<br>${escapeHtml(p.name.split(' ')[0])}</button>`).join('')};
  mini('#primaryGrid','primary'); mini('#receiverGrid','receiver'); mini('#tacklerGrid','tackler'); mini('#assistGrid','assist');
  $('#primaryLabel').textContent=st.type==='pass'?'Passer':'Ball Carrier';
  $$('#statModal [data-pick]').forEach(b=>b.onclick=()=>{if(b.dataset.pick==='assist'&&!st.tackler)return toast('Pick a main tackler first'); st[b.dataset.pick]=st[b.dataset.pick]===b.dataset.id?null:b.dataset.id; renderStatModal();});
  $$('#statModal [data-result]').forEach(b=>b.classList.toggle('on',b.dataset.result===st.result));
  const outcomeDisabled=st.type==='pass'&&st.result!=='complete';
  $$('#statModal [data-outcome]').forEach(b=>{b.classList.toggle('on',!!st[b.dataset.outcome]);b.disabled=b.dataset.outcome==='deadSnap'?false:outcomeDisabled;});
  $('#offOutcomeHint').textContent=st.type==='pass'?'Touchdown/fumble require Complete. Dead Snap can be tracked by itself.':'Track touchdown, fumble, or a dead snap.';
  $$('#statModal [data-def]').forEach(b=>b.classList.toggle('on',b.dataset.def===st.defResult));
  $('#skipStatBtn').textContent=editing?'Make Snap Only':'Skip Stats';
  $('#savePlayBtn').textContent=editing?'Save Changes':'Save Play';
}
$$('.stat-type [data-ptype]').forEach(b=>b.onclick=()=>{state.stat.type=b.dataset.ptype; if(state.stat.type!=='pass')state.stat.result=''; renderStatModal();});
$('#ydMinus').onclick=()=>{state.stat.yards=(Number(state.stat.yards)||0)-1;renderStatModal()}; $('#ydPlus').onclick=()=>{state.stat.yards=(Number(state.stat.yards)||0)+1;renderStatModal()}; $('#yardsInput').oninput=e=>state.stat.yards=Number(e.target.value)||0; $$('#quickYards [data-yard]').forEach(b=>b.onclick=()=>{state.stat.yards=Number(b.dataset.yard)||0;renderStatModal();});
$('#defYdMinus').onclick=()=>{state.stat.defYards=(Number(state.stat.defYards)||0)-1;renderStatModal()}; $('#defYdPlus').onclick=()=>{state.stat.defYards=(Number(state.stat.defYards)||0)+1;renderStatModal()}; $('#defYardsInput').oninput=e=>state.stat.defYards=Number(e.target.value)||0; $$('#defQuickYards [data-def-yard]').forEach(b=>b.onclick=()=>{state.stat.defYards=Number(b.dataset.defYard)||0;renderStatModal();});
$$('#statModal [data-result]').forEach(b=>b.onclick=()=>{state.stat.result=b.dataset.result; if(state.stat.result!=='complete'){state.stat.touchdown=false;state.stat.fumble=false;} renderStatModal()});
$$('#statModal [data-outcome]').forEach(b=>b.onclick=()=>{if(b.disabled)return; const key=b.dataset.outcome; state.stat[key]=!state.stat[key]; if(key==='deadSnap'&&state.stat.deadSnap){state.stat.touchdown=false;state.stat.fumble=false;} else if((key==='touchdown'||key==='fumble')&&state.stat[key])state.stat.deadSnap=false; renderStatModal();});
$$('#statModal [data-def]').forEach(b=>b.onclick=()=>{state.stat.defResult=b.dataset.def;renderStatModal()});
$('#skipStatBtn').onclick=()=>savePlay(true); $('#savePlayBtn').onclick=()=>savePlay(false);
async function savePlay(skip){
  const st=state.stat;
  if(!state.current)return;
  const editing=Number.isInteger(state.editingPlayIndex);
  const players=sanitizedPlayerIds(editing?(st.players||[]):[...state.selected],state.current.team);
  if(players.length!==requiredPlayers(state.current.team))return toast(`Need exactly ${requiredPlayers(state.current.team)} players on the play.`);
  if(!skip&&st.phase==='defense'&&st.assist&&!st.tackler)return toast('Assist needs main tackler');
  if(!skip&&st.phase!=='defense'&&(st.touchdown||st.fumble)){
    const actor=st.type==='pass'?st.receiver:st.primary;
    if(!actor)return toast(`Select the ${st.type==='pass'?'receiver':'ball carrier'} first`);
    if(st.type==='pass'&&st.result!=='complete')return toast('A receiver touchdown or fumble requires a completed pass');
  }
  const old=editing?(state.current.plays||[])[state.editingPlayIndex]:null;
  const play={
    id:old?.id||crypto.randomUUID(),num:old?.num||((state.current.plays||[]).length+1),at:old?.at||nowIso(),phase:st.phase||state.phase,
    players,type:skip?'snap':st.type,yards:skip?0:Number(st.yards||0),defYards:skip?0:Number(st.defYards||0),result:skip?'':(st.result||''),
    touchdown:skip?false:!!st.touchdown,fumble:skip?false:!!st.fumble,deadSnap:skip?false:!!st.deadSnap,
    primary:skip?null:st.primary,receiver:skip?null:st.receiver,tackler:skip?null:st.tackler,assist:skip?null:st.assist,defResult:skip?'':(st.defResult||''),
    scorer:old?.scorer||state.user.email
  };
  if(editing){play.editedAt=nowIso();play.editedBy=state.user.email;}
  if(editing){
    const idx=state.editingPlayIndex;
    if(idx<0||idx>=(state.current.plays||[]).length)return toast('Play not found');
    state.current.plays=[...state.current.plays];
    state.current.plays[idx]=play;
  }else state.current.plays=[...(state.current.plays||[]),play];
  state.editingPlayId=null;
  state.editingPlayIndex=null;
  markDirty();
  $('#statModal').classList.add('hidden');
  await cloudSave(editing?'edit play':'snap');
  renderAll();
  toast(editing?'Play updated':'Play saved');
}

function renderRoster(){if(!state.groups[state.editGroup])state.editGroup=Object.keys(state.groups)[0]; renderGroups('#editGroups',true); const g=state.groups[state.editGroup]; const req=requiredPlayers(state.team); $('#groupProgress').textContent=g?`${g.name}: ${g.players.length}/${req} selected`:''; $('#rosterPlayers').innerHTML=roster(state.team).map(p=>playerHtml(p,g?.players.includes(p.id),snapCount(p.id))).join('');}
let groupEditorMode='edit';
function openGroupEditor(mode){groupEditorMode=mode; const g=mode==='create'?{name:`Preset ${Object.keys(state.groups).length+1}`,color:colors[Object.keys(state.groups).length%colors.length]}:state.groups[state.editGroup]; if(!g)return; $('#groupModalTitle').textContent=mode==='create'?'Add Preset':'Edit Preset'; $('#groupModalSub').textContent=mode==='create'?'Create another reusable on-field group.':'Rename and recolor the selected preset.'; $('#groupNameInput').value=g.name; $('#groupColors').innerHTML=colors.map(c=>`<button class="color-dot ${g.color===c?'on':''}" data-color="${c}" style="background:${c}"></button>`).join(''); $$('#groupColors [data-color]').forEach(b=>b.onclick=()=>{$$('#groupColors .color-dot').forEach(x=>x.classList.remove('on'));b.classList.add('on')}); $('#groupModal').classList.remove('hidden');}
$('#renameGroupBtn').onclick=()=>openGroupEditor('edit'); $('#addGroupBtn').onclick=()=>openGroupEditor('create'); $('#saveGroupBtn').onclick=async()=>{const existing=state.groups[state.editGroup]; const c=$('#groupColors .on')?.dataset.color||existing?.color||colors[0]; const name=String($('#groupNameInput').value||existing?.name||'Custom Preset').trim().slice(0,40)||'Custom Preset'; if(groupEditorMode==='create'){state.editGroup=`custom_${crypto.randomUUID().replaceAll('-','')}`; state.groups[state.editGroup]={name,color:c,players:[]};}else{state.groups[state.editGroup]={...existing,name,color:c};} clearTimeout(presetSaveTimer); try{setSaveStatus('saving');await savePresets(state.team,{groups:state.groups});setSaveStatus(state.dirty?'dirty':'saved');$('#groupModal').classList.add('hidden');renderAll();toast(groupEditorMode==='create'?'Preset added':'Preset saved');}catch(e){console.error(e);setSaveStatus('offline');toast('Could not save preset');}};

function renderSeason(){
  if(!$('#seasonOverview'))return;
  const r=roster(state.team);
  const gs=state.games.filter(g=>g.team===state.team);
  const ss=seasonStats(gs,r);
  $('#seasonOverview').innerHTML=`<div class="metric blue"><b>${ss.team.games}</b><span>Games</span></div><div class="metric green"><b>${ss.team.snaps}</b><span>Snaps</span></div><div class="metric amber"><b>${ss.team.rushYds+ss.team.passYds}</b><span>Off Yards</span></div>`;
  const cols=[
    ['Player',p=>`#${p.num} ${p.name}`,p=>Number(p.num)||0],
    ['Rushes',p=>p.rushAtt,p=>p.rushAtt],
    ['Rush Yds',p=>p.rushYds,p=>p.rushYds],
    ['Receptions',p=>p.rec,p=>p.rec],
    ['Rec Yds',p=>p.recYds,p=>p.recYds],
    ['TD',p=>p.rushTd+p.recTd+p.stTd,p=>p.rushTd+p.recTd+p.stTd],
    ['FUM',p=>p.fumbles,p=>p.fumbles],
    ['Tkl',p=>p.tackles,p=>p.tackles],
    ['Ast',p=>p.assists,p=>p.assists],
    ['Total',p=>p.tackles+p.assists,p=>p.tackles+p.assists],
    ['Sack',p=>p.sacks,p=>p.sacks],
    ['INT',p=>p.ints,p=>p.ints]
  ];
  const active=ss.players.filter(p=>p.snaps||p.rushYds||p.recYds||p.tackles||p.assists||p.sacks||p.ints);
  $('#leaderboards').innerHTML=`<div class="leader-head"><div><div class="section-kicker">Leaderboards</div><h2>Season Leaders</h2></div><span class="leader-hint">Tap any stat to sort ↕</span></div><div class="leader-table-wrap"><table class="table leaderboard-table sortable-table"><thead><tr>${cols.map((c,i)=>`<th class="stat-sort" data-sort-col="${i}" data-sort-dir="" role="button" tabindex="0">${c[0]}</th>`).join('')}</tr></thead><tbody>${active.map(p=>`<tr>${cols.map(c=>`<td data-sort-value="${c[2](p)}">${c[1](p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${active.length?'':'<p class="subline">No stats yet.</p>'}`;
  bindSortableTable($('#leaderboards'));
  $('#playerDirectory').innerHTML=`<div class="section-kicker">Player Profiles</div><div class="player-list">${ss.players.map(p=>`<div class="player-card" data-profile="${p.id}"><div class="pnum">${p.num}</div><div class="pinfo"><div class="pname">${p.name}</div><div class="psub">${p.games} games · ${p.snaps} snaps · ${p.tackles} tackles</div></div><div class="pstat">›</div></div>`).join('')}</div>`;
  $$('[data-profile]').forEach(c=>c.onclick=()=>openPlayer(c.dataset.profile,ss));
}
function openPlayer(id,ss){const p=ss.players.find(x=>x.id===id); const logs=(ss.gameLogs[id]||[]).reverse(); $('#playerTitle').textContent=`#${p.num} ${p.name}`; $('#playerMeta').textContent=`${p.games} games · ${p.snaps} snaps`; $('#playerBody').innerHTML=`<div class="score-grid"><div class="metric blue"><b>${p.snaps}</b><span>Snaps</span></div><div class="metric green"><b>${p.rushYds+p.recYds}</b><span>Off Yards</span></div><div class="metric amber"><b>${p.tackles+p.assists}</b><span>Tkl + Ast</span></div></div><h3>Season Line</h3><table class="table"><tbody><tr><td>Off/Def/ST</td><td>${p.off}/${p.def}/${p.st}</td></tr><tr><td>Rush</td><td>${p.rushAtt}-${p.rushYds}, ${p.rushTd} TD</td></tr><tr><td>Receiving</td><td>${p.rec}-${p.recYds}, ${p.recTd} TD</td></tr><tr><td>Ball Security</td><td>${p.fumbles} FUM · ${p.deadSnaps} DS</td></tr><tr><td>Defense</td><td>${p.tackles} TKL, ${p.assists} AST, ${p.sacks} SACK, ${p.ints} INT</td></tr></tbody></table><h3>Game Log</h3>${logs.map(l=>`<div class="game-card"><h3>${escapeHtml(l.game)}</h3><p class="subline">${escapeHtml(l.team)} · ${new Date(l.date).toLocaleDateString()}</p><div class="score-grid"><div class="metric blue"><b>${l.stats.snaps}</b><span>Snaps</span></div><div class="metric green"><b>${l.stats.rushYds+l.stats.recYds}</b><span>Yards</span></div><div class="metric amber"><b>${l.stats.tackles+l.stats.assists}</b><span>Tkl+Ast</span></div></div></div>`).join('')||'<p>No games yet.</p>'}`; $('#playerModal').classList.remove('hidden');}
$('#exportSeasonBtn').onclick=()=>download(`SnapTrack_${state.team.replace('/','-')}_season.csv`,seasonCsv(state.games.filter(g=>g.team===state.team),roster(state.team)));

function renderGames(){const gs=state.games.filter(g=>canUseTeam(g.team)); $('#gamesList').innerHTML=gs.map(g=>`<div class="game-card"><div class="section-kicker">${g.status==='live'?'🟢 Live':'Completed'}${g.scrimmage?' · 🟠 Scrimmage':''} · ${g.team}</div><h3>${g.name||'Game'}</h3><p class="subline">${(g.plays||[]).length} plays · ${new Date(g.date||Date.now()).toLocaleDateString()}${g.scrimmage?' · Does not count toward season stats':''}</p><div class="game-actions"><button class="btn primary" data-open="${g.id}">${g.status==='live'?'Resume':'Open'}</button><button class="btn" data-box="${g.id}">Boxscore</button><button class="btn" data-csv="${g.id}">CSV</button><button class="btn ${g.scrimmage?'':'amber'}" data-scrimmage="${g.id}">${g.scrimmage?'Count in Season':'Mark Scrimmage'}</button>${state.access?.admin?`<button class="btn danger" data-delete="${g.id}">Delete</button>`:''}</div></div>`).join('')||'<div class="card">No games yet.</div>'; $$('[data-open]').forEach(b=>b.onclick=()=>openGame(state.games.find(g=>g.id===b.dataset.open))); $$('[data-box]').forEach(b=>openBoxHandler(b)); $$('[data-csv]').forEach(b=>b.onclick=()=>{const g=state.games.find(x=>x.id===b.dataset.csv); download(`${g.team}_${g.name||'game'}.csv`,gameCsv(g,roster(g.team)));}); $$('[data-scrimmage]').forEach(b=>b.onclick=()=>toggleScrimmage(b.dataset.scrimmage)); $$('[data-delete]').forEach(b=>b.onclick=()=>deleteSavedGame(b.dataset.delete));}
async function toggleScrimmage(id){
  const g=state.games.find(x=>x.id===id);
  if(!g)return;
  const next=!g.scrimmage;
  try{
    const updated={...g,scrimmage:next,updatedBy:state.user.uid,updatedByEmail:state.user.email};
    await saveGame(id,cleanGame(updated));
    g.scrimmage=next;
    if(state.current?.id===id)state.current.scrimmage=next;
    renderSeason(); renderGames(); renderHeader();
    toast(next?'Marked scrimmage — excluded from season stats':'Game now counts toward season stats');
  }catch(e){console.error('Scrimmage update failed',e);toast('Could not update scrimmage status');}
}
async function deleteSavedGame(id){if(!state.access?.admin)return toast('Admin access required'); const g=state.games.find(x=>x.id===id); if(!g)return; if(!confirm(`Delete ${g.team} ${g.name||'Game'} and all ${(g.plays||[]).length} plays? This cannot be undone.`))return; try{await removeGame(id); clearDraft(id); state.games=state.games.filter(x=>x.id!==id); if(state.current?.id===id){if(state.unsubGame){state.unsubGame();state.unsubGame=null;} state.current=null; state.selected.clear(); state.dirty=false; setSaveStatus('saved');} renderAll(); toast('Game deleted');}catch(e){console.error('Delete failed',e);toast('Could not delete game');}}
function bindSortableTable(root){
  if(!root)return;
  root.querySelectorAll('.stat-sort').forEach(th=>{
    const sort=()=>{
      const table=th.closest('table');
      const body=table?.tBodies?.[0];
      if(!body)return;
      const col=Number(th.dataset.sortCol);
      const next=th.dataset.sortDir==='desc'?'asc':'desc';
      table.querySelectorAll('.stat-sort').forEach(h=>{h.dataset.sortDir='';h.classList.remove('sorted-asc','sorted-desc');});
      th.dataset.sortDir=next;
      th.classList.add(next==='asc'?'sorted-asc':'sorted-desc');
      const rows=[...body.rows];
      rows.sort((a,b)=>{
        const av=Number(a.cells[col]?.dataset.sortValue||0);
        const bv=Number(b.cells[col]?.dataset.sortValue||0);
        if(av!==bv)return next==='asc'?av-bv:bv-av;
        const an=Number(a.cells[0]?.dataset.sortValue||0);
        const bn=Number(b.cells[0]?.dataset.sortValue||0);
        return an-bn;
      });
      rows.forEach(r=>body.appendChild(r));
    };
    th.onclick=sort;
    th.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sort();}};
  });
}
function bindBoxscoreSort(){bindSortableTable($('#boxBody'));}
function openBoxHandler(b){b.onclick=()=>{const g=state.games.find(x=>x.id===b.dataset.box); $('#boxTitle').textContent=`${g.team} ${g.name||'Boxscore'}`; $('#boxMeta').textContent=`${(g.plays||[]).length} plays · ${new Date(g.date||Date.now()).toLocaleDateString()}`; $('#boxBody').innerHTML=boxscoreHtml(g,roster(g.team)); bindBoxscoreSort(); $('#boxModal').classList.remove('hidden');};}
$('#refreshGamesBtn').onclick=()=>renderGames(); $('#exportGameBtn').onclick=()=>state.current&&download(`${state.current.team}_${state.current.name||'game'}_timeline.csv`,gameCsv(state.current,roster(state.current.team)));
function renderTimeline(){const plays=state.current?.plays||[]; $('#timelineList').innerHTML=plays.length?plays.map((pl,index)=>({pl,index})).reverse().map(({pl,index})=>{const names=(pl.players||[]).map(id=>roster(state.current.team).find(p=>p.id===id)).filter(Boolean).map(p=>`#${p.num}`).join(' '); const stat=pl.phase==='defense'?defDesc(pl):offDesc(pl); const edited=pl.editedAt?' · edited':''; return `<div class="timeline-item editable" data-edit-play-index="${index}" role="button" tabindex="0"><div class="timeline-num">${pl.num||index+1}</div><div class="timeline-body"><div class="timeline-title">${pl.phase.toUpperCase()} · ${stat}</div><div class="timeline-meta">${names} · scored by ${escapeHtml(pl.scorer||'')}${edited}</div><div class="timeline-edit-hint">Tap to edit play</div></div></div>`}).join(''):'<div class="card">No timeline yet.</div>';}
function offDesc(pl){if(pl.type==='snap')return 'Snap only'; if(pl.deadSnap)return 'Dead Snap'; const r=roster(state.current.team); const p=id=>r.find(x=>x.id===id); const outcomes=[(pl.touchdown||pl.result==='td')?'TD':'',pl.fumble?'FUMBLE':'',pl.deadSnap?'DEAD SNAP':''].filter(Boolean).join(' · '); if(pl.type==='pass')return `Pass ${p(pl.primary)?.name||''} → ${p(pl.receiver)?.name||''} ${pl.yards||0} yds ${pl.result||''} ${outcomes}`.trim(); return `${pl.type} ${p(pl.primary)?.name||''} ${pl.yards||0} yds ${outcomes}`.trim();}
function defDesc(pl){const r=roster(state.current.team); const p=id=>r.find(x=>x.id===id)?.name||''; const y=Number(pl.defYards??pl.yards??0); return `${pl.defResult||'Defense'} ${p(pl.tackler)}${pl.assist?' / '+p(pl.assist):''} · ${y} opp yds`;}

bindTap('#timelineList','.timeline-item[data-edit-play-index]',card=>openEditPlay(card.dataset.editPlayIndex));
bindTap('#gamePlayers','.player-card',card=>{const id=card.dataset.id; state.selected.has(id)?state.selected.delete(id):state.selected.add(id); renderGame();});
bindTap('#rosterPlayers','.player-card',card=>{const arr=state.groups[state.editGroup].players; const id=card.dataset.id; const i=arr.indexOf(id); i>=0?arr.splice(i,1):arr.push(id); renderRoster(); renderGame(); schedulePresetSave();});

$('#peopleBtn').onclick=async()=>{await renderAdmin({currentUser:state.user,accessCache:state.accessCache,container:$('#adminPeople'),toast}); $('#adminModal').classList.remove('hidden');}; $('#addUserBtn').onclick=async()=>{await addManualUser($('#manualUserEmail').value,state.accessCache,toast); $('#manualUserEmail').value=''; await renderAdmin({currentUser:state.user,accessCache:state.accessCache,container:$('#adminPeople'),toast});};
$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.add('hidden')); window.addEventListener('online',()=>{if(state.dirty)cloudSave('online');}); window.addEventListener('offline',()=>{if(state.current)persistDraft();setSaveStatus('offline');}); document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.dirty)persistDraft();}); window.addEventListener('beforeunload',()=>{if(state.dirty)persistDraft();}); setInterval(()=>{if(state.dirty){persistDraft();if(navigator.onLine)cloudSave('periodic');}},15000);


// Edit roster (temporary)
document.getElementById('editRosterBtn')?.addEventListener('click',()=>{
  alert('Roster editor coming in next build. For now, roster data is stored in app.js.');
});
