const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../core-logic.js');

test('buildRows creates contiguous beat ranges',()=>{
  const built=core.buildRows([
    ['Verse',8,['C']],['Verse',4,['G']],['Chorus',16,['F']]
  ]);
  assert.equal(built.total,28);
  assert.deepEqual(built.rows.map(r=>[r.start,r.end]),[[0,8],[8,12],[12,28]]);
});

test('section kind recognizes Vietnamese and English labels',()=>{
  assert.equal(core.sectionKind('Tiền ĐK'),'pre');
  assert.equal(core.sectionKind('Điệp khúc 2'),'chorus');
  assert.equal(core.sectionKind('Final +1 Tone'),'chorus');
  assert.equal(core.sectionKind('Interlude'),'interlude');
  assert.equal(core.sectionKind('Outro'),'outro');
  assert.equal(core.sectionKind('Verse 3'),'verse');
});

test('section timeline counts repeats by musical kind',()=>{
  const {rows}=core.buildRows([
    ['Verse 1',16,[]],['Chorus 1',16,[]],['Verse 2',16,[]],['Chorus 2',16,[]]
  ]);
  const t=core.buildSectionTimeline(rows,()=>({gain:1}));
  assert.deepEqual(t.map(s=>[s.kind,s.occurrence]),[
    ['verse',1],['chorus',1],['verse',2],['chorus',2]
  ]);
});

test('8-bar section uses one 8-bar phrase',()=>{
  const {rows}=core.buildRows([['Chorus',32,[]]]);
  const t=core.buildSectionTimeline(rows,()=>({}));
  assert.equal(t[0].bars,8);
  assert.equal(t[0].phraseBars,8);
  const start=core.phraseContextAtBeat(t,0);
  const end=core.phraseContextAtBeat(t,31);
  assert.equal(start.phraseBar,1);
  assert.equal(start.phraseBars,8);
  assert.equal(end.phraseBar,8);
  assert.equal(end.lastBeat,true);
});

test('12-bar section becomes 8 + 4 phrase',()=>{
  const {rows}=core.buildRows([['Verse',48,[]]]);
  const t=core.buildSectionTimeline(rows,()=>({}));
  const firstEnd=core.phraseContextAtBeat(t,31);
  const secondStart=core.phraseContextAtBeat(t,32);
  const finalBeat=core.phraseContextAtBeat(t,47);
  assert.deepEqual([firstEnd.phraseIndex,firstEnd.phraseBar,firstEnd.phraseBars],[1,8,8]);
  assert.deepEqual([secondStart.phraseIndex,secondStart.phraseBar,secondStart.phraseBars],[2,1,4]);
  assert.deepEqual([finalBeat.phraseIndex,finalBeat.phraseBar,finalBeat.phraseBars,finalBeat.lastBeat],[2,4,4,true]);
});

test('short partial section keeps a sensible 4-bar phrase cap',()=>{
  const {rows}=core.buildRows([['Bridge',10,[]]]);
  const t=core.buildSectionTimeline(rows,()=>({}));
  assert.equal(t[0].bars,3);
  assert.equal(t[0].phraseBars,4);
  const p=core.phraseContextAtBeat(t,9);
  assert.equal(p.phraseBars,3);
  assert.equal(p.phraseBar,3);
});

test('GREEN permissions allow full automation',()=>{
  const p=core.healthPermissions('green');
  assert.equal(p.reposition,true);
  assert.equal(p.bigFill,true);
  assert.equal(p.rejoin,true);
});

test('YELLOW blocks risky position and big fill while keeping follow',()=>{
  const p=core.healthPermissions('yellow');
  assert.equal(p.intensity,true);
  assert.equal(p.tempo,true);
  assert.equal(p.barSync,true);
  assert.equal(p.transition,true);
  assert.equal(p.reposition,false);
  assert.equal(p.bigFill,false);
});

test('RED becomes manual safe but still permits hold protection',()=>{
  const p=core.healthPermissions('red');
  assert.equal(p.intensity,false);
  assert.equal(p.tempo,false);
  assert.equal(p.barSync,false);
  assert.equal(p.transition,false);
  assert.equal(p.reposition,false);
  assert.equal(p.hold,true);
  assert.equal(p.rejoin,false);
});

test('health thresholds preserve hysteresis bands',()=>{
  assert.equal(core.healthLevelForScore(.72),'green');
  assert.equal(core.healthLevelForScore(.71),'yellow');
  assert.equal(core.healthLevelForScore(.47),'yellow');
  assert.equal(core.healthLevelForScore(.469),'red');
});

test('HOLD rejoin accepts a full 50 BPM 4/4 wait',()=>{
  assert.equal(core.rejoinDelayAllowed(4800),true);
  assert.equal(core.rejoinDelayAllowed(5200),true);
  assert.equal(core.rejoinDelayAllowed(5201),false);
  assert.equal(core.rejoinDelayAllowed(24),false);
});

test('section transition requires the immediately next section and 5..16 beats',()=>{
  const base={playing:true,paused:false,countIn:0,followHeld:false,pendingFollowHold:false,pendingSectionTransition:false,pendingHarmonicAnchor:false,currentIndex:1,targetIndex:2};
  assert.equal(core.canRequestSectionTransition({...base,beatsAway:5}),true);
  assert.equal(core.canRequestSectionTransition({...base,beatsAway:16}),true);
  assert.equal(core.canRequestSectionTransition({...base,beatsAway:4}),false);
  assert.equal(core.canRequestSectionTransition({...base,beatsAway:17}),false);
  assert.equal(core.canRequestSectionTransition({...base,targetIndex:3,beatsAway:8}),false);
  assert.equal(core.canRequestSectionTransition({...base,followHeld:true,beatsAway:8}),false);
});

test('chord transpose handles slash bass',()=>{
  assert.equal(core.transposeChord('C/E',2,false),'D/F#');
  assert.equal(core.transposeChord('F#m7/C#',1,false),'Gm7/D');
  assert.equal(core.transposeChord('C',10,true),'Bb');
});

test('chord parser accepts current song chord shapes',()=>{
  for(const chord of ['C','C7','Em7','Gm7','Em7b5','D/A','F#m7','Bb','Csus4']){
    assert.equal(core.isChord(chord),true,chord);
  }
  assert.equal(core.isChord('hello'),false);
});

test('capo recommendations stay in range and preserve sounding key relation',()=>{
  const song={
    baseKey:5,preferFlats:true,
    rows:[['Verse',8,['F',' ','Bb',' ','C7',' ','Dm']]]
  };
  const target=7;
  const opts=core.capoOptions(song,target);
  assert.ok(opts.length>=2&&opts.length<=3);
  assert.ok(opts.some(x=>x.capo===0));
  for(const opt of opts){
    assert.ok(opt.capo>=0&&opt.capo<=7);
    assert.equal((opt.shapeKey+opt.capo)%12,target);
  }
});

const thresholds={onsetRiseBase:.105,minEnergy:.20,guitarEvidenceMin:.28,drumReject:.58,voiceReject:.68,voiceTransientMax:.22};

test('replay pass estimate accepts strong guitar evidence',()=>{
  const sample={mic:{guitarEvidence:.62,energy:.55,drumPenalty:.10,voiceLike:.15,transient:.35,flux:.12,onsetRise:.18}};
  assert.equal(core.samplePassEstimate(sample,thresholds),true);
});

test('replay pass estimate rejects drum contamination',()=>{
  const sample={mic:{guitarEvidence:.18,energy:.60,drumPenalty:.82,voiceLike:.15,transient:.38,flux:.16,onsetRise:.20}};
  assert.equal(core.samplePassEstimate(sample,thresholds),false);
});

test('old telemetry without onsetRise uses conservative compatibility fallback',()=>{
  const sample={mic:{guitarEvidence:.60,energy:.50,drumPenalty:.12,voiceLike:.12,transient:.35,flux:.12}};
  assert.equal(core.samplePassEstimate(sample,thresholds),true);
});

test('regression blocker catches material guitar retention loss',()=>{
  const blockers=core.regressionBlockers({
    compare:{guitarRetentionBefore:.90,guitarRetentionAfter:.79,guitarSamples:30,contaminationPassBefore:.2,contaminationPassAfter:.18,contaminatedSamples:20},
    markBefore:{score:.7,directional:2},markAfter:{score:.72,directional:2},actionBefore:.1,actionAfter:.1
  });
  assert.ok(blockers.some(x=>x.startsWith('guitar retention')));
});

test('regression blocker catches contamination leakage',()=>{
  const blockers=core.regressionBlockers({
    compare:{guitarRetentionBefore:.9,guitarRetentionAfter:.9,guitarSamples:30,contaminationPassBefore:.20,contaminationPassAfter:.25,contaminatedSamples:30},
    markBefore:{score:.7,directional:2},markAfter:{score:.7,directional:2},actionBefore:.1,actionAfter:.1
  });
  assert.ok(blockers.some(x=>x.startsWith('contamination')));
});

test('small harmless replay changes pass regression guards',()=>{
  const blockers=core.regressionBlockers({
    compare:{guitarRetentionBefore:.90,guitarRetentionAfter:.88,guitarSamples:30,contaminationPassBefore:.25,contaminationPassAfter:.20,contaminatedSamples:30},
    markBefore:{score:.70,directional:2},markAfter:{score:.78,directional:2},actionBefore:.12,actionAfter:.10
  });
  assert.deepEqual(blockers,[]);
});


function validationSample(t,patch={}){
  return {
    t,
    transport:{section:'Verse',held:false,followMode:'normal'},
    mic:{inputClass:'guitar',acceptedOnsets:0,rejectedOnsets:0,energy:.4,guitarEvidence:.6,drumPenalty:.1,voiceLike:.1,state:'medium'},
    tempo:{confidence:.7,barConfidence:.7},
    health:{level:'green',score:.8},
    plan:{mode:'stay'},
    fusion:{mode:'locked'},
    ...patch,
    mic:{inputClass:'guitar',acceptedOnsets:0,rejectedOnsets:0,energy:.4,guitarEvidence:.6,drumPenalty:.1,voiceLike:.1,state:'medium',...(patch.mic||{})},
    tempo:{confidence:.7,barConfidence:.7,...(patch.tempo||{})},
    health:{level:'green',score:.8,...(patch.health||{})},
    transport:{section:'Verse',held:false,followMode:'normal',...(patch.transport||{})},
    plan:{mode:'stay',...(patch.plan||{})},
    fusion:{mode:'locked',...(patch.fusion||{})}
  };
}

test('validation drum-only passes when bleed is rejected',()=>{
  const session={samples:[
    validationSample(0,{mic:{inputClass:'drum',acceptedOnsets:0,guitarEvidence:.08,drumPenalty:.8}}),
    validationSample(1000,{mic:{inputClass:'drum',acceptedOnsets:1,guitarEvidence:.07,drumPenalty:.82}}),
    validationSample(2000,{mic:{inputClass:'drum',acceptedOnsets:1,guitarEvidence:.06,drumPenalty:.85}}),
    validationSample(3000,{mic:{inputClass:'drum',acceptedOnsets:1,guitarEvidence:.08,drumPenalty:.78}})
  ],events:[]};
  const m=core.validationWindowMetrics(session,0,3000);
  assert.equal(m.acceptedOnsets,1);
  assert.equal(core.validationStepStatus('drum',m).status,'pass');
});

test('validation voice-only fails on repeated false guitar onset',()=>{
  const session={samples:[
    validationSample(0,{mic:{inputClass:'guitar',acceptedOnsets:0,voiceLike:.8,guitarEvidence:.38}}),
    validationSample(1000,{mic:{inputClass:'guitar',acceptedOnsets:2,voiceLike:.82,guitarEvidence:.4}}),
    validationSample(2000,{mic:{inputClass:'voice',acceptedOnsets:4,voiceLike:.84,guitarEvidence:.25}}),
    validationSample(3000,{mic:{inputClass:'guitar',acceptedOnsets:7,voiceLike:.86,guitarEvidence:.4}})
  ],events:[]};
  const m=core.validationWindowMetrics(session,0,3000);
  assert.equal(core.validationStepStatus('voice',m).status,'fail');
});

test('validation guitar step measures tempo and bar lock relative to step start',()=>{
  const session={samples:[
    validationSample(1000,{mic:{acceptedOnsets:0},tempo:{confidence:.2,barConfidence:.2}}),
    validationSample(2000,{mic:{acceptedOnsets:2},tempo:{confidence:.5,barConfidence:.4}}),
    validationSample(3000,{mic:{acceptedOnsets:4},tempo:{confidence:.65,barConfidence:.5}}),
    validationSample(4500,{mic:{acceptedOnsets:6},tempo:{confidence:.72,barConfidence:.7}})
  ],events:[]};
  const m=core.validationWindowMetrics(session,1000,4500);
  assert.equal(m.tempoLockMs,2000);
  assert.equal(m.barLockMs,3500);
  assert.equal(core.validationStepStatus('guitar',m).status,'pass');
});

test('validation stop-resume requires both HOLD and REJOIN',()=>{
  const session={samples:[
    validationSample(0),
    validationSample(1000,{transport:{held:true,followMode:'hold'},fusion:{mode:'hold'}}),
    validationSample(2000,{transport:{held:true,followMode:'hold'},fusion:{mode:'reacquire'}}),
    validationSample(3000,{fusion:{mode:'rejoin'}})
  ],events:[]};
  const m=core.validationWindowMetrics(session,0,3000);
  assert.equal(m.heldSeen,true);
  assert.equal(m.rejoinSeen,true);
  assert.equal(core.validationStepStatus('stop-resume',m).status,'pass');
});

test('validation transition passes only when plan and section change are both observed',()=>{
  const session={samples:[
    validationSample(0,{transport:{section:'Verse'},plan:{mode:'build'}}),
    validationSample(1000,{transport:{section:'Verse'},plan:{mode:'armed'}}),
    validationSample(2000,{transport:{section:'Chorus'},plan:{mode:'fill-medium'}}),
    validationSample(3000,{transport:{section:'Chorus'},plan:{mode:'stay'}})
  ],events:[]};
  const m=core.validationWindowMetrics(session,0,3000);
  assert.equal(m.sectionChanged,true);
  assert.equal(m.planFillSeen,true);
  assert.equal(core.validationStepStatus('transition',m).status,'pass');
});

test('validation report summarizes guided session',()=>{
  const samples=[];
  for(let i=0;i<4;i++)samples.push(validationSample(i*500,{mic:{inputClass:'drum',acceptedOnsets:i?1:0,guitarEvidence:.06}}));
  for(let i=0;i<4;i++)samples.push(validationSample(3000+i*500,{mic:{inputClass:'voice',acceptedOnsets:i?1:0,guitarEvidence:.08}}));
  for(let i=0;i<4;i++)samples.push(validationSample(6000+i*500,{mic:{acceptedOnsets:i*2},tempo:{confidence:i>=1?.7:.2,barConfidence:i>=2?.7:.2}}));
  const report=core.buildValidationReport(
    {samples,events:[]},
    [
      {id:'drum',label:'Drum',startT:0,endT:1500},
      {id:'voice',label:'Voice',startT:3000,endT:4500},
      {id:'guitar',label:'Guitar',startT:6000,endT:7500}
    ]
  );
  assert.equal(report.completedSteps,3);
  assert.equal(report.micSeparation,'pass');
  assert.equal(report.falseDrumOnsets,1);
  assert.equal(report.voiceFalseTriggers,1);
  assert.ok(report.tempoLockMedianMs!=null);
});
