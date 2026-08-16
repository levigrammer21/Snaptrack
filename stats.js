export function emptyLine(p){
  return {
    id:p.id,num:p.num,name:p.name,snaps:0,off:0,def:0,st:0,
    rushAtt:0,rushYds:0,rushTd:0,rec:0,recYds:0,recTd:0,
    passAtt:0,passCmp:0,passYds:0,passTd:0,intsThrown:0,
    fumbles:0,deadSnaps:0,stTd:0,tackles:0,assists:0,sacks:0,ints:0,ff:0,fr:0,
    tdAllowed:0,longRush:0,longRec:0,games:0
  };
}

export function gameStats(game, roster=[]){
  const map={};
  roster.forEach(p=>map[p.id]=emptyLine(p));
  const team={snaps:0,off:0,def:0,st:0,rushAtt:0,rushYds:0,passAtt:0,passCmp:0,passYds:0,rec:0,recYds:0,tackles:0,assists:0,sacks:0,ints:0,fr:0,fumbles:0,deadSnaps:0,defYds:0,td:0};

  (game.plays||[]).forEach(pl=>{
    team.snaps++;
    if(pl.phase==='offense')team.off++;
    else if(pl.phase==='defense')team.def++;
    else team.st++;

    (pl.players||[]).forEach(id=>{
      if(!map[id])return;
      map[id].snaps++;
      if(pl.phase==='offense')map[id].off++;
      else if(pl.phase==='defense')map[id].def++;
      else map[id].st++;
    });

    const y=Number(pl.yards||0);
    const touchdown=!!pl.touchdown||pl.result==='td';

    if(!pl.deadSnap&&pl.type==='run'&&pl.primary){
      const runner=map[pl.primary];
      if(runner){
        runner.rushAtt++;
        runner.rushYds+=y;
        runner.longRush=Math.max(runner.longRush,y);
        if(touchdown)runner.rushTd++;
      }
      team.rushAtt++;
      team.rushYds+=y;
    }

    if(!pl.deadSnap&&pl.type==='pass'){
      team.passAtt++;
      const passer=map[pl.primary];
      if(passer)passer.passAtt++;
      const complete=pl.result==='complete'||pl.result==='td';
      if(complete){
        team.passCmp++;
        team.passYds+=y;
        team.rec++;
        team.recYds+=y;
        if(passer){passer.passCmp++;passer.passYds+=y;}
        const receiver=map[pl.receiver];
        if(receiver){receiver.rec++;receiver.recYds+=y;receiver.longRec=Math.max(receiver.longRec,y);}
      }
      if(touchdown){
        if(passer)passer.passTd++;
        const receiver=map[pl.receiver];
        if(receiver)receiver.recTd++;
      }
      if(pl.result==='int'&&passer)passer.intsThrown++;
    }

    if(pl.type==='special'&&touchdown&&pl.primary&&map[pl.primary])map[pl.primary].stTd++;
    if(touchdown)team.td++;

    if(pl.fumble){
      const ballCarrier=pl.type==='pass'?map[pl.receiver]:map[pl.primary];
      if(ballCarrier)ballCarrier.fumbles++;
      team.fumbles++;
    }

    if(pl.deadSnap){
      const deadSnapPlayer=pl.primary&&map[pl.primary];
      if(deadSnapPlayer)deadSnapPlayer.deadSnaps++;
      team.deadSnaps++;
    }

    if(pl.phase==='defense'){
      const dy=Number(pl.defYards??pl.yards??0);
      team.defYds+=dy;
    }

    if(pl.tackler&&map[pl.tackler]){map[pl.tackler].tackles++;team.tackles++;}
    if(pl.assist&&map[pl.assist]){map[pl.assist].assists++;team.assists++;}
    if(pl.defResult==='sack'&&pl.tackler&&map[pl.tackler]){map[pl.tackler].sacks++;team.sacks++;}
    if(pl.defResult==='int'&&pl.tackler&&map[pl.tackler]){map[pl.tackler].ints++;team.ints++;}
    if(pl.defResult==='fumble'&&pl.tackler&&map[pl.tackler]){map[pl.tackler].fr++;team.fr++;}
    if(pl.defResult==='tdAllowed'&&pl.tackler&&map[pl.tackler])map[pl.tackler].tdAllowed++;
  });

  return {team,players:Object.values(map).sort((a,b)=>b.snaps-a.snaps||Number(a.num)-Number(b.num))};
}

export function seasonStats(games, roster=[]){
  const base={};
  roster.forEach(p=>base[p.id]=emptyLine(p));
  const team={games:0,snaps:0,off:0,def:0,st:0,rushAtt:0,rushYds:0,passAtt:0,passCmp:0,passYds:0,rec:0,recYds:0,tackles:0,assists:0,sacks:0,ints:0,fr:0,fumbles:0,deadSnaps:0,defYds:0,td:0};
  const gameLogs={};

  games.filter(g=>g.status==='ended'&&!g.scrimmage).forEach(g=>{
    team.games++;
    const gs=gameStats(g,roster);
    Object.keys(team).forEach(k=>{if(k!=='games')team[k]+=gs.team[k]||0;});
    gs.players.forEach(line=>{
      if(!base[line.id])base[line.id]=emptyLine(line);
      const had=line.snaps>0;
      Object.keys(line).forEach(k=>{if(typeof line[k]==='number'&&k!=='games')base[line.id][k]+=line[k];});
      if(had)base[line.id].games++;
      (gameLogs[line.id]||=[]).push({game:g.name||g.opponent,date:g.date,team:g.team,stats:line});
    });
  });

  return {team,players:Object.values(base).sort((a,b)=>b.snaps-a.snaps||Number(a.num)-Number(b.num)),gameLogs};
}

export function csv(rows){
  return rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
}

export function download(name,text){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'text/csv'}));
  a.download=name;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

export function boxscoreHtml(game, roster){
  const s=gameStats(game,roster);
  const rows=(arr,cols)=>`<table class="table sortable-table"><thead><tr>${cols.map((c,i)=>`<th class="stat-sort" data-sort-col="${i}" data-sort-dir="" role="button" tabindex="0">${c[0]}</th>`).join('')}</tr></thead><tbody>${arr.map(p=>`<tr>${cols.map(c=>`<td data-sort-value="${c[2](p)}">${c[1](p)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const off=s.players.filter(p=>p.off||p.rushAtt||p.rec||p.passAtt||p.fumbles||p.deadSnaps||p.stTd);
  const def=s.players.filter(p=>p.def||p.tackles||p.assists||p.sacks||p.ints||p.fr);
  const part=s.players.filter(p=>p.snaps);
  return `<div class="score-grid"><div class="metric blue"><b>${s.team.snaps}</b><span>Total Snaps</span></div><div class="metric green"><b>${s.team.rushYds+s.team.passYds}</b><span>Off Yards</span></div><div class="metric amber"><b>${s.team.defYds}</b><span>Opp Yards</span></div></div><h3>Offense</h3>${rows(off,[['Player',p=>`#${p.num} ${p.name}`,p=>Number(p.num)||0],['Off',p=>p.off,p=>p.off],['Rush',p=>`${p.rushAtt}-${p.rushYds}`,p=>p.rushYds],['Long',p=>p.longRush,p=>p.longRush],['Rec',p=>`${p.rec}-${p.recYds}`,p=>p.recYds],['TD',p=>p.rushTd+p.recTd+p.stTd,p=>p.rushTd+p.recTd+p.stTd],['FUM',p=>p.fumbles,p=>p.fumbles],['DS',p=>p.deadSnaps,p=>p.deadSnaps]])}<h3>Defense</h3>${rows(def,[['Player',p=>`#${p.num} ${p.name}`,p=>Number(p.num)||0],['Def',p=>p.def,p=>p.def],['Tkl',p=>p.tackles,p=>p.tackles],['Ast',p=>p.assists,p=>p.assists],['Sack',p=>p.sacks,p=>p.sacks],['INT',p=>p.ints,p=>p.ints],['FR',p=>p.fr,p=>p.fr]])}<h3>Participation</h3>${rows(part,[['Player',p=>`#${p.num} ${p.name}`,p=>Number(p.num)||0],['Snaps',p=>p.snaps,p=>p.snaps],['Off',p=>p.off,p=>p.off],['Def',p=>p.def,p=>p.def],['ST',p=>p.st,p=>p.st],['%',p=>s.team.snaps?Math.round(p.snaps/s.team.snaps*100)+'%':'0%',p=>s.team.snaps?Math.round(p.snaps/s.team.snaps*100):0]])}`;
}

const exportHeader=['Player','Snaps','Off','Def','ST','RushAtt','RushYds','RushTD','Rec','RecYds','RecTD','PassTD','STTD','Fumbles','DeadSnaps','Tackles','Assists','Sacks','INT','FR'];
const exportLine=p=>[`${p.num} ${p.name}`,p.snaps,p.off,p.def,p.st,p.rushAtt,p.rushYds,p.rushTd,p.rec,p.recYds,p.recTd,p.passTd,p.stTd,p.fumbles,p.deadSnaps,p.tackles,p.assists,p.sacks,p.ints,p.fr];

export function gameCsv(game,roster){
  const s=gameStats(game,roster);
  return csv([exportHeader,...s.players.map(exportLine)]);
}

export function seasonCsv(games,roster){
  const s=seasonStats(games,roster);
  return csv([['Player','Games',...exportHeader.slice(1)],...s.players.map(p=>[`${p.num} ${p.name}`,p.games,...exportLine(p).slice(1)])]);
}
