(() => {
  'use strict';
  const sdk=window.__DSH_GAMECENTER_SDK__;
  const $=id=>document.getElementById(id);
  let view=null,selected=new Set(),busy=false,paused=false,manualPaused=false,epoch=0,hint=0,sequence=0,lastDecision='',pausePromise=Promise.resolve();
  const insights=window.LandlordInsights;
  let review=null,reviewOpen=false,reviewLoading=false;
  const names=['你','电脑 1','电脑 2'];
  const rank=c=>c>=52?c-36:Math.floor(c/4)+3;
  const cardName=c=>c===52?'小王':c===53?'大王':['♠','♥','♣','♦'][c%4]+({11:'J',12:'Q',13:'K',14:'A',15:'2'}[rank(c)]||rank(c));
  function card(c,clickable=false){const el=document.createElement(clickable?'button':'span');el.className='card'+(c<52&&[1,3].includes(c%4)?' red':'');el.textContent=cardName(c);
    if(clickable){const corner=document.createElement('span');corner.className='corner';const value=document.createElement('span'),suit=document.createElement('span');value.textContent=c>=52?(c===52?'小':'大'):({11:'J',12:'Q',13:'K',14:'A',15:'2'}[rank(c)]||rank(c));suit.textContent=c>=52?'王':['♠','♥','♣','♦'][c%4];corner.append(value,suit);el.replaceChildren(corner);el.type='button';el.setAttribute('aria-label',cardName(c));el.setAttribute('aria-pressed',String(selected.has(c)));if(selected.has(c))el.classList.add('selected');el.disabled=busy||paused||view.turn!==0||view.phase!=='playing';el.onclick=()=>{selected.has(c)?selected.delete(c):selected.add(c);render();};}return el;}
  function cards(container,list){container.replaceChildren(...list.map(c=>card(c)));}
  function action(label,run,primary=false,disabled=false){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run;b.disabled=disabled||busy||paused;if(primary)b.className='primary';$('actions').append(b);}
  function render(){
    $('paused').hidden=!paused;if(!view)return;document.body.dataset.phase=view.phase;
    $('remaining-panel').hidden=!$('show-remaining').checked;
    if($('show-remaining').checked)$('remaining-cards').replaceChildren(...insights.remainingRanks(view).map(item=>{const el=document.createElement('span');el.className='remaining-rank'+(item.count===0?' exhausted':'');el.textContent=`${item.label} × ${item.count}`;return el;}));
    $('review').hidden=view.phase!=='finished';$('review').disabled=busy||paused||reviewLoading;
    $('review').textContent=reviewLoading?'正在读取本局记录…':'查看本局 AI 对话与 Token';
    $('review-panel').hidden=!reviewOpen||view.phase!=='finished';
    $('phase').textContent=view.phase==='finished'?'本局结束':view.phase==='bidding'?`${names[view.turn]}叫地主 · 当前 ${view.highestBid} 分`:`${names[view.turn]}出牌`;
    for(const seat of [1,2]){const el=$('seat'+seat);el.className='seat'+(view.turn===seat&&view.phase!=='finished'?' active':'');el.replaceChildren();const strong=document.createElement('strong');strong.textContent=names[seat]+(view.landlord===seat?' · 地主':view.landlord===null?'':' · 农民');const small=document.createElement('small');small.textContent=`剩余 ${view.remainingCounts[seat]} 张`;const backs=document.createElement('div');backs.className='backs';for(let i=0;i<Math.min(view.remainingCounts[seat],8);i++){const back=document.createElement('span');back.className='back';backs.append(back);}el.append(strong,small,backs);}
    if(view.bottomCards.length)cards($('bottom'),view.bottomCards);else{$('bottom').replaceChildren();for(let i=0;i<3;i++){const back=document.createElement('span');back.className='card back';back.textContent='?';$('bottom').append(back);}}
    $('you').textContent='你'+(view.landlord===0?' · 地主':view.landlord===null?'':' · 农民');$('hand-count').textContent=`${view.ownHand.length} 张`;$('selected-count').textContent=selected.size?`已选 ${selected.size} 张`:'';
    $('hand').replaceChildren(...[...view.ownHand].reverse().map(c=>card(c,true)));$('actions').replaceChildren();
    if(view.phase==='bidding'&&view.turn===0)for(const n of view.legalBids)action(n===0?'不叫':`叫 ${n} 分`,()=>send('bid',{bid:n}),n===3);
    if(view.phase==='playing'&&view.turn===0){action('出牌',()=>send('play',{cards:[...selected]}),true,selected.size===0);action('不出',()=>send('pass'),false,!view.last);action('提示',()=>{const m=view.legalMoves[hint++%view.legalMoves.length];selected=new Set(m?.cards||[]);render();});action('取消选择',()=>{selected.clear();render();});}
    if(view.turn!==0&&view.phase!=='finished')action(busy?'电脑思考中…':'继续电脑回合',()=>pump());
    $('last-play').replaceChildren();if(view.last){const label=document.createElement('div');const kinds={single:'单张',pair:'对子',triple:'三张',bomb:'炸弹',rocket:'王炸','triple-single':'三带一','triple-pair':'三带二',straight:'顺子','pair-straight':'连对',plane:'飞机','plane-single':'飞机带单','plane-pair':'飞机带对','four-two-single':'四带二','four-two-pair':'四带两对'};label.textContent=names[view.last.seat]+' · '+(kinds[view.last.combo.kind]||view.last.combo.kind);const row=document.createElement('div');row.className='cards';cards(row,view.last.cards);$('last-play').append(label,row);}else $('last-play').textContent=view.phase==='bidding'?'叫地主结束后公开三张底牌':'新一轮自由出牌';
    $('decision').textContent=lastDecision;$('result').textContent=view.phase==='finished'?(view.winningSide==='landlord'?'地主获胜':'农民获胜'):'';
    $('history').replaceChildren(...view.history.map(p=>{const li=document.createElement('li');li.textContent=names[p.seat]+'：'+(p.cards.length?p.cards.map(cardName).join(' '):'不出');return li;}));
  }
  async function send(type,extra={}){
    if(paused||(busy&&type!=='new'))return;const current=type==='new'?++epoch:epoch;
    if(type==='new'){review=null;reviewOpen=false;reviewLoading=false;$('review-content').replaceChildren();}
    busy=true;$('error').textContent='';render();
    try{
      const result=await sdk.game.command({action:type,operationId:type==='ai'?`ai-turn-${view.revision}`:`human-${++sequence}-${Date.now()}`,...(view?{expectedRevision:view.revision}:{}),...extra});
      if(current!==epoch)return;if(!result?.ok)throw new Error(result?.message||'牌局命令失败');view=result.view;selected.clear();
      if(result.decision){const d=result.decision;lastDecision=d.source==='ai'?`${names[d.seat]} · AI ${d.binding.modelId} / ${d.binding.reasoningEffort||'提供方默认'} · ${d.elapsedMs}ms`:`${names[d.seat]} · 本地策略：${d.reason}`;}
      else if(type==='new')lastDecision='';
    }catch(e){if(!paused&&current===epoch)$('error').textContent=e.message||String(e);return;}
    finally{if(current===epoch){busy=false;render();}}
    if(!paused&&view.phase!=='finished'&&view.turn!==0)setTimeout(()=>pump(),450);
  }
  function pump(){if(!busy&&!paused&&view&&view.turn!==0&&view.phase!=='finished')void send('ai');}
  async function resume(){await pausePromise;paused=false;render();if(!busy){await send('state');pump();}}
  function pause(){manualPaused=true;paused=true;epoch++;busy=false;reviewLoading=false;render();pausePromise=sdk.game.command({action:'cancel',operationId:`cancel-${++sequence}-${Date.now()}`}).then(result=>{if(result.ok&&paused)view=result.view;render();}).catch(()=>{});}
  async function openReview(){
    if(!view||view.phase!=='finished'||reviewLoading||busy||paused)return;
    if(review){reviewOpen=true;render();return;}
    const current=epoch,revision=view.revision;reviewLoading=true;render();
    try{const result=await sdk.game.command({action:'review',operationId:`review-${++sequence}-${Date.now()}`,expectedRevision:revision});
      if(current!==epoch||view.revision!==revision||view.phase!=='finished')return;
      if(!result?.ok)throw new Error(result?.message||'读取记录失败');
      review=result.review;reviewOpen=true;insights.renderReview($('review-content'),review);
    }catch(e){if(current===epoch)$('error').textContent=e.message||String(e);}
    finally{if(current===epoch){reviewLoading=false;render();}}
  }
  $('show-remaining').onchange=()=>render();
  $('review').onclick=()=>void openReview();$('close-review').onclick=()=>{reviewOpen=false;render();};
  $('new').onclick=()=>void send('new');$('pause').onclick=()=>pause();
  $('resume').onclick=()=>{manualPaused=false;void resume();};
  if(!sdk?.game?.command){$('error').textContent='斗地主需要新版 GameCenter Host 与客户端，请重载应用后启动预览。';$('new').disabled=true;$('pause').disabled=true;return;}
  sdk.lifecycle.register({pause:()=>{paused=true;epoch++;busy=false;reviewLoading=false;render();},resume:()=>{if(!manualPaused)void resume();}});
  const theme=mode=>{document.body.dataset.theme=mode;};theme(sdk.theme?.get?.()||'dark');sdk.theme?.subscribe?.(theme);
  void sdk.lifecycle.ready().then(()=>send('state')).catch(e=>{$('error').textContent=e.message;});
})();
