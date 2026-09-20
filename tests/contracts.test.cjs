const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html');
const follow=read('guitar-follow.js');
const tone=read('tone.js');
const core=read('core-logic.js');
const sw=read('sw.js');
const workflow=read('.github/workflows/pages.yml');

test('all runtime JavaScript parses',()=>{
  new Function(core);
  new Function(follow);
  new Function(tone);
  const inline=[...index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  assert.ok(inline.length>=1);
  inline.forEach(src=>new Function(src));
});

test('shared core loads before main player and external modules',()=>{
  const corePos=index.indexOf('<script src="./core-logic.js"></script>');
  const mainPos=index.indexOf('<script>\n(() => {');
  const tonePos=index.indexOf('<script src="./tone.js"></script>');
  const followPos=index.indexOf('<script src="./guitar-follow.js"></script>');
  assert.ok(corePos>0&&corePos<mainPos&&mainPos<tonePos&&tonePos<followPos);
});

test('runtime delegates critical safeguards to shared core',()=>{
  for(const token of [
    'core.buildRows(song.rows)',
    'core.buildSectionTimeline(rows,arrangementForRow)',
    'core.phraseContextAtBeat(sectionTimeline(),beat)',
    'core.canRequestSectionTransition',
    'core.rejoinDelayAllowed'
  ])assert.ok(index.includes(token),token);
  assert.ok(follow.includes('core.healthPermissions(followHealth.level)'));
  assert.ok(follow.includes('core.regressionBlockers'));
  assert.ok(follow.includes('core.samplePassEstimate'));
  assert.ok(tone.includes('core.capoOptions(api.getCurrentSong(),targetKey)'));
});

test('song catalog has exactly the three current songs with sane timing data',()=>{
  const m=index.match(/const songs=({[\s\S]*?\n  });\n\n  let songId/);
  assert.ok(m,'songs object not found');
  const songs=vm.runInNewContext('('+m[1]+')');
  assert.deepEqual(Object.keys(songs).sort(),['giac-mo-tinh-yeu','nang-tho','que-xa']);
  for(const [id,song] of Object.entries(songs)){
    assert.ok(song.title&&song.artist,id);
    assert.ok(Number.isInteger(song.baseKey)&&song.baseKey>=0&&song.baseKey<12,id);
    assert.ok(song.defaultBpm>=50&&song.defaultBpm<=90,id);
    assert.ok(Array.isArray(song.rows)&&song.rows.length>=10,id);
    for(const row of song.rows){
      assert.equal(row.length,3,id);
      assert.ok(typeof row[0]==='string'&&row[0],id);
      assert.ok(Number(row[1])>0,id);
      assert.ok(Array.isArray(row[2]),id);
    }
  }
});

test('tone references cover all current songs',()=>{
  const refs=JSON.parse(read('tone-references.json'));
  for(const id of ['nang-tho','que-xa','giac-mo-tinh-yeu']){
    assert.ok(refs.songs?.[id],id);
    assert.equal(refs.songs[id].profile.length,12,id);
  }
});

test('service worker precaches every required runtime asset',()=>{
  for(const asset of ['./index.html','./core-logic.js','./tone.js','./guitar-follow.js','./tone-references.json','./manifest.json','./icon.svg']){
    assert.ok(sw.includes('"'+asset+'"'),asset);
  }
});

test('Playing mode defaults compact and Developer diagnostics remain available',()=>{
  assert.ok(follow.includes('let developerMode = false'));
  assert.ok(follow.includes(".gd-follow:not(.gd-dev-on) .gd-dev-only"));
  assert.ok(follow.includes('gdPlayingSummary'));
  assert.ok(index.includes('guitar-drum-transport'));
});

test('phrase mini-turn cannot replace predictive transition fill wiring',()=>{
  assert.ok(index.includes("if(!autoTurn&&!pendingSectionTransition&&fillRemaining===0)"));
  assert.ok(index.includes('schedulePhraseTurn'));
  assert.ok(index.includes("pendingSectionTransition.stage='filling'"));
  assert.ok(index.includes("pendingSectionTransition.stage='anchor'"));
});

test('Clean Mic models all generated drum voices',()=>{
  for(const voice of ['kick','snare','ghost','hat','openHat','ride','rim','tom','crash','click']){
    assert.ok(follow.includes(voice+':')||follow.includes("'"+voice+"'"),voice);
  }
});

test('deploy workflow gates Pages deployment on tests',()=>{
  assert.match(workflow,/jobs:\s*\n\s*test:/);
  assert.match(workflow,/deploy:\s*\n\s*needs:\s*test/);
  assert.match(workflow,/node --test/);
});

test('debug export cache version matches service-worker cache version',()=>{
  const cache=sw.match(/guitar-drum-v(\d+)/)?.[1];
  const debug=follow.match(/appCache:'v(\d+)'/)?.[1];
  assert.ok(cache&&debug);
  assert.equal(debug,cache);
});


test('guided Validation Session is wired into Developer telemetry',()=>{
  for(const token of [
    'VALIDATION_STEPS',
    'gdValidationOpen',
    'validation-step-start',
    'validation-step-end',
    'core.validationWindowMetrics',
    'core.validationStepStatus',
    'core.buildValidationReport',
    'addValidationToRegression'
  ]) assert.ok(follow.includes(token),token);
  assert.ok(follow.includes("label:'validation:'"));
  assert.ok(follow.includes('validation:validationReport?'));
});

test('validation core is shared with runtime rather than duplicated report scoring',()=>{
  for(const token of ['validationWindowMetrics','validationStepStatus','buildValidationReport']){
    assert.ok(core.includes('function '+token),token);
    assert.ok(follow.includes('core.'+token),token);
  }
});


test('input classification uses a persistent candidate hold',()=>{
  assert.ok(follow.includes("let inputCandidate = 'unknown'"));
  assert.ok(follow.includes('inputCandidateSince = 0'));
  assert.ok(follow.includes('nextClass!==inputCandidate'));
  assert.ok(follow.includes('now-inputCandidateSince>=INPUT_CLASS_HOLD_MS'));
});

test('guided validation defines all ten intended scenarios',()=>{
  for(const id of ['quiet','drum','guitar','voice','guitar-voice','full-mix','stop-resume','transition','soft-big','free']){
    assert.ok(follow.includes("id:'"+id+"'"),id);
  }
});
