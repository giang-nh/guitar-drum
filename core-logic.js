(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GuitarDrumCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const NOTES_SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const NOTES_FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const NOTE_MAP={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
  const COMMON_KEYS=[7,0,2,9,4];
  const CHORD_RE=/^[A-G](?:#|b)?(?:m|maj|dim|aug|sus|add)?\d*(?:b5|#5|b9|#9|11|13)?(?:\/[A-G](?:#|b)?)?$/;

  function clamp(v,lo=0,hi=1){return Math.max(lo,Math.min(hi,Number(v)||0))}
  function buildRows(songRows){
    let total=0;
    const rows=(songRows||[]).map((d,i)=>{
      const r={s:d[0],b:Number(d[1])||0,parts:d[2]||[],start:total,i};
      total+=r.b;r.end=total;return r;
    });
    return {rows,total};
  }
  function sectionKind(name){
    const v=String(name||'').toLowerCase();
    if(v.includes('intro'))return 'intro';
    if(v.includes('tiền'))return 'pre';
    if(v.includes('chorus')||v.includes('điệp khúc')||v.includes('final'))return 'chorus';
    if(v.includes('bridge'))return 'bridge';
    if(v.includes('interlude'))return 'interlude';
    if(v.includes('outro'))return 'outro';
    return 'verse';
  }
  function buildSectionTimeline(rows,resolveArrangement){
    const out=[];let startRow=0;const occurrences={};
    for(let i=1;i<=rows.length;i++){
      if(i===rows.length||rows[i].s!==rows[startRow].s){
        const arr=typeof resolveArrangement==='function'
          ? (resolveArrangement(startRow)||{})
          : ((resolveArrangement||{})[rows[startRow].s]||{});
        const startBeat=rows[startRow].start,endBeat=rows[i-1].end;
        const bars=Math.max(1,Math.ceil((endBeat-startBeat)/4));
        const kind=sectionKind(rows[startRow].s);
        occurrences[kind]=(occurrences[kind]||0)+1;
        out.push({
          index:out.length,name:rows[startRow].s,kind,occurrence:occurrences[kind],
          startBeat,endBeat,bars,phraseBars:bars>=8?8:4,startRow,endRow:i-1,
          gain:Number(arr.gain||1),pattern:arr.pattern||kind,autoFillIn:Boolean(arr.autoFillIn)
        });
        startRow=i;
      }
    }
    return out;
  }
  function phraseContextAtBeat(timeline,beat){
    if(!Array.isArray(timeline)||!timeline.length)return null;
    const b=Number(beat)||0;
    const section=timeline.find(s=>b>=s.startBeat&&b<s.endBeat)||timeline[timeline.length-1];
    const localBeat=Math.max(0,Math.min(Math.max(0,section.endBeat-section.startBeat-1),b-section.startBeat));
    const sectionBar=Math.floor(localBeat/4);
    const beatInBar=((Math.floor(localBeat)%4)+4)%4;
    const nominalPhraseBars=section.phraseBars||4;
    const phraseIndex=Math.floor(sectionBar/nominalPhraseBars);
    const phraseStartBar=phraseIndex*nominalPhraseBars;
    const phraseBars=Math.max(1,Math.min(nominalPhraseBars,section.bars-phraseStartBar));
    const phraseBar=Math.min(phraseBars,sectionBar-phraseStartBar+1);
    const phraseStartBeat=section.startBeat+phraseStartBar*4;
    const phraseEndBeat=Math.min(section.endBeat,phraseStartBeat+phraseBars*4);
    const phraseSpan=Math.max(1,phraseEndBeat-phraseStartBeat);
    const progress=clamp((b-phraseStartBeat)/phraseSpan);
    const sectionSpan=Math.max(1,section.endBeat-section.startBeat);
    const sectionProgress=clamp((b-section.startBeat)/sectionSpan);
    return {
      sectionIndex:section.index,sectionName:section.name,kind:section.kind,occurrence:section.occurrence,
      sectionBars:section.bars,sectionBar:sectionBar+1,sectionProgress,phraseIndex:phraseIndex+1,
      phraseBars,phraseBar,beatInBar,progress,phraseStartBeat,phraseEndBeat,
      beatsToPhraseEnd:Math.max(0,phraseEndBeat-b),lastBar:phraseBar===phraseBars,
      lastBeat:phraseBar===phraseBars&&beatInBar===3
    };
  }
  function healthPermissions(level){
    if(level==='green')return {intensity:true,tempo:true,barSync:true,reposition:true,transition:true,bigFill:true,hold:true,rejoin:true};
    if(level==='yellow')return {intensity:true,tempo:true,barSync:true,reposition:false,transition:true,bigFill:false,hold:true,rejoin:true};
    return {intensity:false,tempo:false,barSync:false,reposition:false,transition:false,bigFill:false,hold:true,rejoin:false};
  }
  function healthLevelForScore(score,greenMin=.72,redMax=.47){
    if(score>=greenMin)return 'green';
    if(score<redMax)return 'red';
    return 'yellow';
  }
  function rejoinDelayAllowed(delayMs){return Number.isFinite(Number(delayMs))&&Number(delayMs)>=25&&Number(delayMs)<=5200}
  function canRequestSectionTransition(s){
    if(!s?.playing||s.paused||Number(s.countIn)>0||s.followHeld||s.pendingFollowHold||s.pendingSectionTransition||s.pendingHarmonicAnchor)return false;
    if(Number(s.currentIndex)<0||Number(s.targetIndex)!==Number(s.currentIndex)+1)return false;
    const beats=Number(s.beatsAway);
    return Number.isFinite(beats)&&beats>=5&&beats<=16;
  }
  function isChord(v){return CHORD_RE.test(String(v||''))}
  function transposeChord(chord,shift,preferFlats=false){
    const m=String(chord||'').match(/^([A-G])([#b]?)(.*)$/);if(!m)return chord;
    const root=NOTE_MAP[m[1]+m[2]];if(root==null)return chord;
    const names=preferFlats?NOTES_FLAT:NOTES_SHARP;
    let rest=m[3]||'';
    rest=rest.replace(/\/([A-G])([#b]?)/,(_,a,b)=>{
      const bass=NOTE_MAP[a+b];return bass==null?'/'+a+b:'/'+names[(bass+shift+12)%12];
    });
    return names[(root+shift+12)%12]+rest;
  }
  function chordDifficulty(chord){
    const m=String(chord||'').match(/^([A-G])([#b]?)(.*)$/);if(!m)return 1;
    const rootName=m[1]+m[2],root=NOTE_MAP[rootName],rest=m[3]||'';
    const minor=/^m(?!aj)/.test(rest),dim=/dim|m7b5/.test(rest),slash=rest.includes('/');
    let score=0;
    if(dim)score+=2.8;
    else if(minor){
      if([9,4,2].includes(root))score+=.2;else if([11,6].includes(root))score+=1.5;else score+=2.3;
    }else{
      if([0,2,4,7,9].includes(root))score+=.15;else if(root===5)score+=1.4;else if(root===11)score+=2;else score+=2.5;
    }
    if(/[#b]/.test(rootName))score+=.8;
    if(/maj7|add|sus|11|13|b5|#5|b9|#9/.test(rest))score+=.45;else if(/7/.test(rest))score+=.2;
    if(slash)score+=.45;return score;
  }
  function collectChords(song){
    const set=new Set();
    (song?.rows||[]).forEach(row=>(row?.[2]||[]).forEach(v=>{if(isChord(v))set.add(v)}));
    return [...set];
  }
  function capoOptions(song,targetKey){
    const chords=collectChords(song),options=[];
    for(let capo=0;capo<=7;capo++){
      const shapeKey=(targetKey-capo+12)%12,shapeShift=(shapeKey-song.baseKey+12)%12;
      const shapes=chords.map(ch=>transposeChord(ch,shapeShift,Boolean(song.preferFlats)));
      const avg=shapes.reduce((sum,ch)=>sum+chordDifficulty(ch),0)/Math.max(1,shapes.length);
      const commonBonus=COMMON_KEYS.includes(shapeKey)?-.55:0;
      const capoPenalty=capo===0?0:capo*.08+(capo>5?.25:0);
      options.push({targetKey,shapeKey,capo,score:avg+capoPenalty+commonBonus});
    }
    options.sort((a,b)=>a.score-b.score);
    const noCapo=options.find(x=>x.capo===0),result=[options[0]];
    if(noCapo&&noCapo!==options[0])result.push(noCapo);
    for(const opt of options){
      if(result.length>=3)break;
      if(!result.some(x=>x.capo===opt.capo&&x.shapeKey===opt.shapeKey))result.push(opt);
    }
    return result;
  }
  function samplePassEstimate(sample,t){
    const m=sample?.mic||{},guitar=Number(m.guitarEvidence)||0,energy=Number(m.energy)||0;
    const drum=Number(m.drumPenalty)||0,voice=Number(m.voiceLike)||0;
    const transient=Number.isFinite(Number(m.transient))?Number(m.transient):.20;
    const rejectedByDrum=drum>t.drumReject&&guitar<Math.max(t.guitarEvidenceMin+.20,.48);
    const rejectedByVoice=voice>t.voiceReject&&transient<t.voiceTransientMax;
    const spectralOk=guitar>=t.guitarEvidenceMin||(drum<Math.max(.26,t.drumReject-.23)&&(Number(m.flux)||0)>=.08);
    const rise=Number(m.onsetRise),requiredRise=t.onsetRiseBase+drum*.075+voice*.040;
    const onsetOk=Number.isFinite(rise)?rise>requiredRise:true;
    return energy>t.minEnergy&&onsetOk&&spectralOk&&!rejectedByDrum&&!rejectedByVoice;
  }
  function mean(values,fallback=null){
    const nums=(values||[]).map(Number).filter(Number.isFinite);
    return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:fallback;
  }
  function median(values){
    const nums=(values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!nums.length)return null;
    const mid=Math.floor(nums.length/2);
    return nums.length%2?nums[mid]:(nums[mid-1]+nums[mid])/2;
  }
  function validationWindowMetrics(session,startT,endT){
    const samples=(session?.samples||[]).filter(s=>Number(s?.t)>=Number(startT)&&Number(s?.t)<=Number(endT));
    const events=(session?.events||[]).filter(e=>Number(e?.t)>=Number(startT)&&Number(e?.t)<=Number(endT));
    const classes={guitar:0,voice:0,drum:0,mix:0,quiet:0,unknown:0};
    samples.forEach(s=>{const k=s?.mic?.inputClass||'unknown';classes[k]=(classes[k]||0)+1});
    const fraction=k=>samples.length?(classes[k]||0)/samples.length:0;
    const counterDelta=key=>{
      const vals=samples.map(s=>Number(s?.mic?.[key])).filter(Number.isFinite);
      return vals.length?Math.max(0,Math.max(...vals)-Math.min(...vals)):0;
    };
    const firstTempo=samples.find(s=>Number(s?.tempo?.confidence)>=.62);
    const firstBar=samples.find(s=>Number(s?.tempo?.barConfidence)>=.66);
    const sections=[...new Set(samples.map(s=>s?.transport?.section).filter(Boolean))];
    const planModes=[...new Set(samples.map(s=>s?.plan?.mode).filter(Boolean))];
    const fusionModes=[...new Set(samples.map(s=>s?.fusion?.mode).filter(Boolean))];
    return {
      samples:samples.length,
      durationMs:Math.max(0,Number(endT)-Number(startT)),
      acceptedOnsets:counterDelta('acceptedOnsets'),
      rejectedOnsets:counterDelta('rejectedOnsets'),
      avgEnergy:mean(samples.map(s=>s?.mic?.energy),0),
      avgGuitarEvidence:mean(samples.map(s=>s?.mic?.guitarEvidence),0),
      avgDrumPenalty:mean(samples.map(s=>s?.mic?.drumPenalty),0),
      avgVoiceLike:mean(samples.map(s=>s?.mic?.voiceLike),0),
      avgHealth:mean(samples.map(s=>s?.health?.score),0),
      redFraction:samples.length?samples.filter(s=>s?.health?.level==='red').length/samples.length:0,
      greenFraction:samples.length?samples.filter(s=>s?.health?.level==='green').length/samples.length:0,
      guitarFraction:fraction('guitar'),
      drumFraction:fraction('drum'),
      voiceFraction:fraction('voice'),
      mixFraction:fraction('mix'),
      quietFraction:fraction('quiet'),
      tempoLockMs:firstTempo?Math.max(0,Number(firstTempo.t)-Number(startT)):null,
      barLockMs:firstBar?Math.max(0,Number(firstBar.t)-Number(startT)):null,
      heldSeen:samples.some(s=>Boolean(s?.transport?.held)||s?.transport?.followMode==='hold'||s?.fusion?.mode==='hold'),
      rejoinSeen:samples.some(s=>s?.fusion?.mode==='rejoin'||s?.plan?.mode==='rejoin')||
        events.some(e=>String(e?.snapshot?.fusion?.mode||'')==='rejoin'),
      sectionChanged:sections.length>=2,
      planFillSeen:planModes.some(x=>['build','fill-small','fill-medium','fill-big','armed'].includes(x)),
      softSeen:samples.some(s=>s?.mic?.state==='soft'),
      bigSeen:samples.some(s=>s?.mic?.state==='big'),
      sections,planModes,fusionModes
    };
  }
  function validationStepStatus(id,m){
    if(!m||m.samples<4)return {status:'review',reason:'too few samples'};
    if(id==='quiet'){
      if(m.acceptedOnsets<=1&&m.avgEnergy<.20)return {status:'pass',reason:'quiet floor clean'};
      if(m.acceptedOnsets>=4||m.avgEnergy>.36)return {status:'fail',reason:'noise/onset activity too high'};
      return {status:'review',reason:'quiet floor borderline'};
    }
    if(id==='drum'){
      if(m.acceptedOnsets<=2&&m.guitarFraction<.18)return {status:'pass',reason:'speaker bleed rejected'};
      if(m.acceptedOnsets>=6||m.guitarFraction>.36)return {status:'fail',reason:'drum likely triggering guitar onset'};
      return {status:'review',reason:'drum bleed needs review'};
    }
    if(id==='guitar'){
      if(m.acceptedOnsets>=4&&m.tempoLockMs!=null)return {status:'pass',reason:'guitar onset + tempo acquired'};
      if(m.acceptedOnsets<2||m.avgGuitarEvidence<.24)return {status:'fail',reason:'guitar under-detected'};
      return {status:'review',reason:'guitar seen but tempo not locked'};
    }
    if(id==='voice'){
      if(m.acceptedOnsets<=2&&m.guitarFraction<.20)return {status:'pass',reason:'voice rejected as guitar'};
      if(m.acceptedOnsets>=6||m.guitarFraction>.34)return {status:'fail',reason:'voice likely causing false guitar onset'};
      return {status:'review',reason:'voice rejection borderline'};
    }
    if(id==='guitar-voice'||id==='full-mix'){
      if(m.acceptedOnsets>=4&&m.tempoLockMs!=null&&m.redFraction<=.30)return {status:'pass',reason:'usable follow under mixed input'};
      if(m.redFraction>.55||m.acceptedOnsets<2)return {status:'fail',reason:'mixed input follow unstable'};
      return {status:'review',reason:'mixed input partially stable'};
    }
    if(id==='stop-resume'){
      if(m.heldSeen&&m.rejoinSeen)return {status:'pass',reason:'HOLD and REJOIN observed'};
      if(!m.heldSeen)return {status:'fail',reason:'HOLD not observed'};
      return {status:'review',reason:'HOLD seen but REJOIN not confirmed'};
    }
    if(id==='transition'){
      if(m.sectionChanged&&m.planFillSeen)return {status:'pass',reason:'planned transition landed across section'};
      if(!m.planFillSeen)return {status:'review',reason:'no predictive fill/plan observed'};
      return {status:'review',reason:'plan seen; section landing not confirmed'};
    }
    if(id==='soft-big'){
      if(m.softSeen&&m.bigSeen)return {status:'pass',reason:'dynamic range soft→big observed'};
      return {status:'review',reason:'soft/big range not both observed'};
    }
    if(id==='free'){
      if(m.redFraction<=.25&&m.acceptedOnsets>=4)return {status:'pass',reason:'free-play health mostly usable'};
      return {status:'review',reason:'free play captured for inspection'};
    }
    return {status:'review',reason:'observational'};
  }
  function buildValidationReport(session,runs){
    const steps=(runs||[]).filter(r=>r&&Number.isFinite(Number(r.startT))&&Number.isFinite(Number(r.endT))).map(r=>{
      const metrics=validationWindowMetrics(session,r.startT,r.endT);
      const verdict=validationStepStatus(r.id,metrics);
      return {...r,metrics,...verdict};
    });
    const byId=id=>steps.find(s=>s.id===id);
    const lockSteps=steps.filter(s=>['guitar','guitar-voice','full-mix','free'].includes(s.id));
    const tempoLocks=lockSteps.map(s=>s.metrics.tempoLockMs).filter(Number.isFinite);
    const barLocks=lockSteps.map(s=>s.metrics.barLockMs).filter(Number.isFinite);
    const drum=byId('drum'),voice=byId('voice'),stop=byId('stop-resume'),transition=byId('transition');
    const totalSamples=steps.reduce((n,s)=>n+s.metrics.samples,0);
    const redWeighted=steps.reduce((n,s)=>n+s.metrics.redFraction*s.metrics.samples,0);
    const micStatuses=[drum?.status,voice?.status].filter(Boolean);
    const micSeparation=micStatuses.includes('fail')?'fail':micStatuses.every(x=>x==='pass')&&micStatuses.length===2?'pass':'review';
    return {
      createdAt:new Date().toISOString(),
      steps,
      completedSteps:steps.length,
      passSteps:steps.filter(s=>s.status==='pass').length,
      reviewSteps:steps.filter(s=>s.status==='review').length,
      failSteps:steps.filter(s=>s.status==='fail').length,
      micSeparation,
      tempoLockMedianMs:median(tempoLocks),
      barLockMedianMs:median(barLocks),
      falseDrumOnsets:drum?.metrics?.acceptedOnsets??null,
      voiceFalseTriggers:voice?.metrics?.acceptedOnsets??null,
      holdRejoin:stop?.status||'not-run',
      transition:transition?.status||'not-run',
      healthRedFraction:totalSamples?redWeighted/totalSamples:null
    };
  }

  function regressionBlockers(result,limits={}){
    const guitarLimit=limits.guitarLoss??.08,contamLimit=limits.contaminationWorse??.035;
    const markLimit=limits.markWorse??.10,actionLimit=limits.actionWorse??.06;
    const c=result.compare||{},before=result.markBefore||{},after=result.markAfter||{};
    const guitarLoss=c.guitarRetentionBefore!=null&&c.guitarRetentionAfter!=null?c.guitarRetentionBefore-c.guitarRetentionAfter:0;
    const contaminationWorse=c.contaminationPassBefore!=null&&c.contaminationPassAfter!=null?c.contaminationPassAfter-c.contaminationPassBefore:0;
    const markWorse=before.score!=null&&after.score!=null?before.score-after.score:0;
    const actionWorse=result.actionBefore!=null&&result.actionAfter!=null?result.actionAfter-result.actionBefore:0;
    const blockers=[];
    if(c.guitarSamples>=10&&guitarLoss>guitarLimit)blockers.push('guitar retention -'+Math.round(guitarLoss*100)+'pt');
    if(c.contaminatedSamples>=10&&contaminationWorse>contamLimit)blockers.push('contamination +'+Math.round(contaminationWorse*100)+'pt');
    if(before.directional>=1&&markWorse>markLimit)blockers.push('marked cases -'+Math.round(markWorse*100)+'pt');
    if(result.actionBefore!=null&&actionWorse>actionLimit)blockers.push('action-risk proxy +'+Math.round(actionWorse*100)+'pt');
    return blockers;
  }

  return {NOTES_SHARP,NOTES_FLAT,NOTE_MAP,COMMON_KEYS,clamp,buildRows,sectionKind,buildSectionTimeline,phraseContextAtBeat,
    healthPermissions,healthLevelForScore,rejoinDelayAllowed,canRequestSectionTransition,isChord,transposeChord,chordDifficulty,
    collectChords,capoOptions,samplePassEstimate,validationWindowMetrics,validationStepStatus,buildValidationReport,regressionBlockers};
});
