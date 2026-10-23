(() => {
  'use strict';
  const rank=c=>c>=52?c-36:Math.floor(c/4)+3;
  const labels={11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'};
  // Pure calculation from the player's existing view. Bottom cards are not subtracted twice.
  function remainingRanks(view){
    const seen=new Set([...view.ownHand,...view.history.flatMap(p=>p.cards)]);
    return Array.from({length:15},(_,i)=>17-i).map(r=>({rank:r,label:labels[r]||String(r),count:Array.from({length:54},(_,c)=>c).filter(c=>rank(c)===r&&!seen.has(c)).length}));
  }
  const usageLabels={inputTokens:'输入',outputTokens:'输出',totalTokens:'总 Token',cacheReadTokens:'缓存读取',cacheWriteTokens:'缓存写入',reasoningTokens:'推理 Token'};
  function usageText(usage){return Object.entries(usageLabels).map(([key,label])=>`${label}：${usage?.[key]??'未提供'}`).join(' · ');}
  function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
  function renderReview(container,review){
    const {summary,calls}=review;container.replaceChildren();
    const coverage=summary.reportedCalls.totalTokens||0;
    container.append(node('p',`模型调用 ${summary.modelCalls} 次 · 本地策略 ${summary.localDecisions} 次`));
    container.append(node('p',summary.modelCalls===0?'本局未调用模型，Token 消耗为 0。':`已报告总 Token 小计：${coverage?summary.totals.totalTokens:'未提供'} · 用量覆盖 ${coverage}/${summary.modelCalls} 次调用`,'token-total'));
    if(summary.modelCalls)container.append(node('p',usageText(summary.totals)));
    container.append(node('p','缺失用量不按 0 计算。各项均为已报告小计，缓存与推理项不再加到总 Token。记录仅保留本局内存，重新发牌或关闭后清空。','review-note'));
    for(const c of calls){
      const details=document.createElement('details');details.className='call-record';
      const binding=c.binding||c.requestedBinding;
      const status={success:'成功',failed:'调用失败',cancelled:'已取消',local:'本地策略'}[c.status]||c.status;
      details.append(node('summary',`电脑 ${c.seat} · 回合 ${c.revision} · ${binding?binding.modelId+' / '+(binding.reasoningEffort||'提供方默认'):'本地策略'} · ${status} · ${c.elapsedMs}ms`));
      details.append(node('p',`时间：${c.startedAt} · 操作：${c.operationId} · 来源：${{ai:'AI',local:'本地策略',none:'未执行'}[c.source]||c.source}`));
      if(binding)details.append(node('p',`提供方：${binding.providerId} · ${usageText(c.usage)}`));
      if(c.error)details.append(node('p',`原因：${c.error}`));
      for(const [label,text] of [['发送给 AI 的消息',c.prompt],['AI 最终回复',c.response],['实际执行动作',c.action?JSON.stringify(c.action):undefined]]){
        if(text===undefined)continue;details.append(node('h3',label),node('pre',text));
      }
      container.append(details);
    }
  }
  globalThis.LandlordInsights={remainingRanks,usageText,renderReview};
})();
