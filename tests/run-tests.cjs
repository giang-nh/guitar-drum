#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const toneSrc = fs.readFileSync(path.join(root, 'tone.js'), 'utf8');
const followSrc = fs.readFileSync(path.join(root, 'guitar-follow.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extractFunction(src, name) {
  const needle = 'function ' + name + '(';
  const i = src.indexOf(needle);
  if (i < 0) throw new Error('Missing function ' + name);
  let b = src.indexOf('{', i), depth = 0, j = b;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) { j++; break; }
  }
  return src.slice(i, j);
}

function buildContext(bootstrap, src, names, exports) {
  const context = vm.createContext({ Math, Number, String, Set, Array, JSON });
  const code = bootstrap + '\n' + names.map(n => extractFunction(src, n)).join('\n') + '\n' +
    'globalThis.__exports={' + exports.join(',') + '};';
  vm.runInContext(code, context);
  return context.__exports;
}

const tone = buildContext(`
const NOTE_MAP={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const NOTES_SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const COMMON_KEYS=[7,0,2,9,4];
let __song={baseKey:0,preferFlats:false,rows:[]};
const api={getCurrentSong:()=>__song};
function setSong(s){__song=s}
`, toneSrc,
['freqToMidi','transposeChord','chordDifficulty','collectChords','capoOptions'],
['freqToMidi','transposeChord','chordDifficulty','collectChords','capoOptions','setSong']);

const follow = buildContext(`
const NOTE_MAP={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const NOTES_SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const HEALTH_GREEN_MIN=.72, HEALTH_RED_MAX=.47;
let __song={preferFlats:false};
const api={getCurrentSong:()=>__song};
function setSong(s){__song=s}
function round(value,digits=3){const m=10**digits;return Math.round(value*m)/m}
`, followSrc,
['clamp','normalizeBpmFromInterval','median','phaseError','transposeChordSymbol','chordQuality','chordIntervals','boundedThreshold','capTuneDelta','healthLevelForScore'],
['clamp','normalizeBpmFromInterval','median','phaseError','transposeChordSymbol','chordQuality','chordIntervals','boundedThreshold','capTuneDelta','healthLevelForScore','setSong']);

const app = buildContext(`
const noteMap={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const notesFlat=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const notes=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
let song={preferFlats:false}, shift=0;
function setState(s,k){song=s;shift=k}
`, indexSrc,
['transposeChord','isChord','sectionKind'],
['transposeChord','isChord','sectionKind','setState']);

let passed = 0, failed = 0;
const failures = [];
const eq = (a,b) => Object.is(a,b) || JSON.stringify(a) === JSON.stringify(b);
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; failures.push(name + ': ' + e.message); }
}
function assert(v, msg='assertion failed') { if (!v) throw new Error(msg); }
function equal(a,b,msg='') { if (!eq(a,b)) throw new Error((msg ? msg + ' — ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function approx(a,b,eps=.01) { if (Math.abs(a-b) > eps) throw new Error('expected ~' + b + ', got ' + a); }

[
['A4 -> MIDI 69',()=>approx(tone.freqToMidi(440),69,1e-9)],
['A3 -> MIDI 57',()=>approx(tone.freqToMidi(220),57,1e-9)],
['C4 -> MIDI 60',()=>approx(tone.freqToMidi(261.625565),60,.001)],
['C +2 = D',()=>equal(tone.transposeChord('C',2,false),'D')],
['G +2 = A',()=>equal(tone.transposeChord('G',2,false),'A')],
['B +1 = C',()=>equal(tone.transposeChord('B',1,false),'C')],
['C -1 sharp = B',()=>equal(tone.transposeChord('C',-1,false),'B')],
['C +1 sharp = C#',()=>equal(tone.transposeChord('C',1,false),'C#')],
['C +1 flat = Db',()=>equal(tone.transposeChord('C',1,true),'Db')],
['Bb +2 flat = C',()=>equal(tone.transposeChord('Bb',2,true),'C')],
['F#m +1 = Gm',()=>equal(tone.transposeChord('F#m',1,false),'Gm')],
['Cmaj7 +2 = Dmaj7',()=>equal(tone.transposeChord('Cmaj7',2,false),'Dmaj7')],
['C/E +2 = D/F#',()=>equal(tone.transposeChord('C/E',2,false),'D/F#')],
['Bb/D +2 flat = C/E',()=>equal(tone.transposeChord('Bb/D',2,true),'C/E')],
['non chord unchanged',()=>equal(tone.transposeChord('hello',5,false),'hello')],
['easy C easier than C#',()=>assert(tone.chordDifficulty('C')<tone.chordDifficulty('C#'))],
['Am easier than Cm',()=>assert(tone.chordDifficulty('Am')<tone.chordDifficulty('Cm'))],
['dim penalized',()=>assert(tone.chordDifficulty('Cdim')>tone.chordDifficulty('C'))],
['slash penalized',()=>assert(tone.chordDifficulty('C/E')>tone.chordDifficulty('C'))],
['extended penalized',()=>assert(tone.chordDifficulty('Cmaj7')>tone.chordDifficulty('C'))],
['collect unique chords',()=>equal(tone.collectChords({rows:[[0,0,['C','x','G']],[0,0,['C','Am']]]}),['C','G','Am'])],
['collect ignores lyric tokens',()=>equal(tone.collectChords({rows:[[0,0,['hello','world']]]}),[])],
].forEach(x=>test(...x));

tone.setSong({baseKey:5,preferFlats:true,rows:[[0,0,['F','C7','Dm','Am','Bb','Gm']]]});
test('capo options 1..3',()=>{const o=tone.capoOptions(6);assert(o.length>=1&&o.length<=3)});
test('capo options include no-capo',()=>assert(tone.capoOptions(6).some(x=>x.capo===0)));
test('capo best is first',()=>{const o=tone.capoOptions(6);assert(o[0].score<=o[o.length-1].score)});
test('capo in 0..7',()=>assert(tone.capoOptions(6).every(x=>x.capo>=0&&x.capo<=7)));
test('shapeKey relation',()=>assert(tone.capoOptions(6).every(x=>x.shapeKey===(6-x.capo+12)%12)));

[
['interval 500 ->120',()=>approx(follow.normalizeBpmFromInterval(500,60,180),120)],
['interval 1000 ->60',()=>approx(follow.normalizeBpmFromInterval(1000,60,180),60)],
['interval 250 ->120 after half',()=>approx(follow.normalizeBpmFromInterval(250,60,180),120)],
['interval 1500 ->80',()=>approx(follow.normalizeBpmFromInterval(1500,60,180),80)],
['too short null',()=>equal(follow.normalizeBpmFromInterval(100,60,180),null)],
['too long null',()=>equal(follow.normalizeBpmFromInterval(1900,60,180),null)],
['NaN null',()=>equal(follow.normalizeBpmFromInterval(NaN,60,180),null)],
['median odd',()=>equal(follow.median([5,1,3]),3)],
['median even',()=>equal(follow.median([4,1,3,2]),2.5)],
['median empty',()=>equal(follow.median([]),null)],
['median no mutate',()=>{const a=[3,1,2];follow.median(a);equal(a,[3,1,2])}],
['phase at anchor',()=>equal(follow.phaseError(1000,1000,500),0)],
['phase +100',()=>equal(follow.phaseError(1100,1000,500),100)],
['phase wrap +300 -> -200',()=>equal(follow.phaseError(1300,1000,500),-200)],
['phase negative',()=>equal(follow.phaseError(900,1000,500),-100)],
].forEach(x=>test(...x));

follow.setSong({preferFlats:false});
[
['follow C+2=D',()=>equal(follow.transposeChordSymbol('C',2),'D')],
['follow B+1=C',()=>equal(follow.transposeChordSymbol('B',1),'C')],
['follow F#m+1=Gm',()=>equal(follow.transposeChordSymbol('F#m',1),'Gm')],
['follow C/E+2=D/F#',()=>equal(follow.transposeChordSymbol('C/E',2),'D/F#')],
['follow invalid unchanged',()=>equal(follow.transposeChordSymbol('nope',2),'nope')],
].forEach(x=>test(...x));
follow.setSong({preferFlats:true});
test('follow flats',()=>equal(follow.transposeChordSymbol('C',1),'Db'));
test('follow flat slash',()=>equal(follow.transposeChordSymbol('Bb/D',2),'C/E'));

[
['quality major',()=>equal(follow.chordQuality('C'),'maj')],
['quality minor',()=>equal(follow.chordQuality('Am'),'m')],
['quality dominant7',()=>equal(follow.chordQuality('G7'),'7')],
['quality m7',()=>equal(follow.chordQuality('Am7'),'m7')],
['quality maj7',()=>equal(follow.chordQuality('Cmaj7'),'maj7')],
['quality dim',()=>equal(follow.chordQuality('Bdim'),'dim')],
['quality m7b5',()=>equal(follow.chordQuality('Bm7b5'),'m7b5')],
['quality aug',()=>equal(follow.chordQuality('Caug'),'aug')],
['quality sus2',()=>equal(follow.chordQuality('Dsus2'),'sus2')],
['quality sus4',()=>equal(follow.chordQuality('Dsus4'),'sus4')],
['quality invalid',()=>equal(follow.chordQuality('hello'),null)],
['interval major',()=>equal(follow.chordIntervals('maj'),[0,4,7])],
['interval minor',()=>equal(follow.chordIntervals('m'),[0,3,7])],
['interval 7',()=>equal(follow.chordIntervals('7'),[0,4,7,10])],
['interval maj7',()=>equal(follow.chordIntervals('maj7'),[0,4,7,11])],
['interval dim',()=>equal(follow.chordIntervals('dim'),[0,3,6])],
['interval unknown fallback',()=>equal(follow.chordIntervals('wat'),[0,4,7])],
].forEach(x=>test(...x));

[
['bounded onset low',()=>equal(follow.boundedThreshold('onsetRiseBase',0),.088)],
['bounded onset high',()=>equal(follow.boundedThreshold('onsetRiseBase',1),.132)],
['bounded energy',()=>equal(follow.boundedThreshold('minEnergy',.2),.2)],
['bounded drumReject',()=>equal(follow.boundedThreshold('drumReject',.9),.78)],
['bounded unknown',()=>equal(follow.boundedThreshold('other',2),1)],
['cap delta positive',()=>equal(follow.capTuneDelta('onsetRiseBase',.5),.012)],
['cap delta negative',()=>equal(follow.capTuneDelta('minEnergy',-.2),-.04)],
['cap delta inside',()=>equal(follow.capTuneDelta('drumReject',.05),.05)],
['health green threshold',()=>equal(follow.healthLevelForScore(.72),'green')],
['health green high',()=>equal(follow.healthLevelForScore(1),'green')],
['health yellow',()=>equal(follow.healthLevelForScore(.6),'yellow')],
['health red',()=>equal(follow.healthLevelForScore(.46),'red')],
['health 0 red',()=>equal(follow.healthLevelForScore(0),'red')],
['clamp low',()=>equal(follow.clamp(-1,0,1),0)],
['clamp middle',()=>equal(follow.clamp(.5,0,1),.5)],
['clamp high',()=>equal(follow.clamp(2,0,1),1)],
].forEach(x=>test(...x));

app.setState({preferFlats:false},2);
[
['app C+2=D',()=>equal(app.transposeChord('C'),'D')],
['app Am+2=Bm',()=>equal(app.transposeChord('Am'),'Bm')],
['app B+2=C#',()=>equal(app.transposeChord('B'),'C#')],
['app invalid unchanged',()=>equal(app.transposeChord('hello'),'hello')],
].forEach(x=>test(...x));
app.setState({preferFlats:true},1);
test('app flat preference',()=>equal(app.transposeChord('C'),'Db'));

[
['isChord C',()=>assert(app.isChord('C'))],
['isChord F#m',()=>assert(app.isChord('F#m'))],
['isChord Cmaj7',()=>assert(app.isChord('Cmaj7'))],
['isChord G7',()=>assert(app.isChord('G7'))],
['isChord C/E',()=>assert(app.isChord('C/E'))],
['isChord Bm7b5',()=>assert(app.isChord('Bm7b5'))],
['isChord text false',()=>assert(!app.isChord('hello'))],
['isChord empty false',()=>assert(!app.isChord(''))],
['isChord H false',()=>assert(!app.isChord('H'))],
['section intro',()=>equal(app.sectionKind('Intro'),'intro')],
['section pre',()=>equal(app.sectionKind('Tiền ĐK'),'pre')],
['section chorus',()=>equal(app.sectionKind('Chorus'),'chorus')],
['section Vietnamese chorus',()=>equal(app.sectionKind('Điệp khúc'),'chorus')],
['section final',()=>equal(app.sectionKind('Final'),'chorus')],
['section bridge',()=>equal(app.sectionKind('Bridge'),'bridge')],
['section interlude',()=>equal(app.sectionKind('Interlude'),'interlude')],
['section outro',()=>equal(app.sectionKind('Outro'),'outro')],
['section default verse',()=>equal(app.sectionKind('Verse 2'),'verse')],
].forEach(x=>test(...x));

console.log('\nGuitar Drum automated logic tests');
console.log('PASS:', passed);
console.log('FAIL:', failed);
console.log('TOTAL:', passed + failed);
if (failures.length) failures.forEach(x => console.error(' - ' + x));
process.exitCode = failed ? 1 : 0;
