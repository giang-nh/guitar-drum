const { test, expect } = require('@playwright/test');

async function installBrowserHarness(page) {
  await page.addInitScript(() => {
    class FakeParam {
      constructor(value = 0) { this.value = value; }
      setValueAtTime(value) { this.value = value; }
      exponentialRampToValueAtTime(value) { this.value = value; }
      linearRampToValueAtTime(value) { this.value = value; }
    }

    class FakeNode {
      connect() { return this; }
      disconnect() {}
      start() {}
      stop() {}
    }

    class FakeAnalyser extends FakeNode {
      constructor() {
        super();
        this._fftSize = 4096;
        this.frequencyBinCount = 2048;
        this.smoothingTimeConstant = 0;
        this.minDecibels = -90;
        this.maxDecibels = -10;
      }
      set fftSize(value) {
        this._fftSize = Number(value) || 4096;
        this.frequencyBinCount = Math.floor(this._fftSize / 2);
      }
      get fftSize() { return this._fftSize; }
      getFloatTimeDomainData(array) { array.fill(0); }
      getFloatFrequencyData(array) { array.fill(-120); }
    }

    class FakeAudioContext {
      constructor() {
        this.state = 'running';
        this.sampleRate = 44100;
        this.destination = new FakeNode();
        this._startedAt = performance.now();
      }
      get currentTime() {
        return (performance.now() - this._startedAt) / 1000;
      }
      resume() { this.state = 'running'; return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      createGain() {
        const node = new FakeNode();
        node.gain = new FakeParam(1);
        return node;
      }
      createDynamicsCompressor() {
        const node = new FakeNode();
        node.threshold = new FakeParam();
        node.knee = new FakeParam();
        node.ratio = new FakeParam();
        node.attack = new FakeParam();
        node.release = new FakeParam();
        return node;
      }
      createOscillator() {
        const node = new FakeNode();
        node.frequency = new FakeParam(440);
        node.type = 'sine';
        return node;
      }
      createBiquadFilter() {
        const node = new FakeNode();
        node.frequency = new FakeParam();
        node.Q = new FakeParam();
        node.type = 'lowpass';
        return node;
      }
      createBufferSource() {
        const node = new FakeNode();
        node.buffer = null;
        return node;
      }
      createBuffer(channels, length) {
        const data = Array.from({length:channels}, () => new Float32Array(length));
        return { getChannelData: channel => data[channel] };
      }
      createMediaStreamSource() { return new FakeNode(); }
      createAnalyser() { return new FakeAnalyser(); }
    }

    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }]
        })
      }
    });
  });
}

async function openSong(page, songId) {
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await installBrowserHarness(page);
  await page.goto('/?e2e=1');
  await page.locator('#songSelect').selectOption(songId);
  await expect(page.locator('#songSelect')).toHaveValue(songId);
  if ((await page.locator('#viewToggle').textContent()).includes('Show all')) {
    await page.locator('#viewToggle').click();
  }
  const expectedRows = await page.evaluate(() => window.GuitarDrumAPI.getCurrentSong().rows.length);
  await expect(page.locator('#sheet .row')).toHaveCount(expectedRows);
  await page.evaluate(() => { window.__e2ePageReady = true; });
}

async function captureTransport(page) {
  await page.evaluate(() => {
    window.__e2eTransport = [];
    window.addEventListener('guitar-drum-transport', event => {
      const t = window.GuitarDrumAPI?.getTransport?.() || {};
      window.__e2eTransport.push({
        ...event.detail,
        held: Boolean(t.followHeld),
        followMode: t.followSilenceMode || 'normal',
        row: Number(t.currentRow)
      });
    });
  });
}

async function lastRowOfSection(page, section) {
  return page.evaluate(sectionName => {
    const rows = window.GuitarDrumAPI.getCurrentSong().rows;
    let found = -1;
    rows.forEach((row, index) => { if (row[0] === sectionName) found = index; });
    return found;
  }, section);
}

async function playFromRow(page, rowIndex) {
  expect(rowIndex).toBeGreaterThanOrEqual(0);
  await page.locator('#sheet .row').nth(rowIndex).click();
  await page.locator('#toggle').click();
  await page.waitForFunction(() => window.GuitarDrumAPI.getTransport().playing === true);
}

async function waitForNaturalEnd(page) {
  await expect(page.locator('#status')).toContainText('Đã dừng · trở về đầu bài.', {timeout: 20000});
}

async function history(page) {
  return page.evaluate(() => window.__e2eTransport || []);
}

function uniquePlayingSections(items) {
  const out = [];
  for (const item of items) {
    if (!item.playing || !item.section) continue;
    if (out[out.length - 1] !== item.section) out.push(item.section);
  }
  return out;
}

for (const scenario of [
  {song:'que-xa', from:'Verse 3', final:'Outro'},
  {song:'nang-tho', from:'Chorus 2', final:'Final +1 Tone'},
  {song:'giac-mo-tinh-yeu', from:'Điệp khúc', final:'Bridge'}
]) {
  test(`${scenario.song}: final section is reached before natural stop`, async ({page}) => {
    await openSong(page, scenario.song);
    await captureTransport(page);
    const row = await lastRowOfSection(page, scenario.from);
    await playFromRow(page, row);
    await waitForNaturalEnd(page);
    const items = await history(page);
    const finalIndex = items.findIndex(item => item.playing && item.section === scenario.final);
    const stoppedAfter = items.findIndex((item, index) => index > finalIndex && !item.playing);
    expect(finalIndex).toBeGreaterThanOrEqual(0);
    expect(stoppedAfter).toBeGreaterThan(finalIndex);
  });
}

test('Quê Xa runs through Verse 3 into Outro and only stops after the final Outro', async ({page}) => {
  await openSong(page, 'que-xa');
  await captureTransport(page);
  await playFromRow(page, 0);
  await waitForNaturalEnd(page);
  const sections = uniquePlayingSections(await history(page));
  expect(sections).toEqual(['Verse 1','Điệp khúc','Verse 2','Điệp khúc 2','Verse 3','Outro']);
});

test('Auto Follow with a silent mic does not HOLD or freeze Quê Xa before Outro', async ({page}) => {
  await openSong(page, 'que-xa');
  await page.locator('#gdFollowToggle').click();
  await page.waitForFunction(() => window.GuitarFollowAPI?.isRunning?.() === true);
  await captureTransport(page);
  await playFromRow(page, 0);
  await waitForNaturalEnd(page);
  const items = await history(page);
  expect(items.some(item => item.held)).toBe(false);
  expect(items.some(item => item.playing && item.section === 'Outro')).toBe(true);
});

test('Verse 3 can request the immediate Outro transition and continue playing', async ({page}) => {
  await openSong(page, 'que-xa');
  await captureTransport(page);
  const row = await lastRowOfSection(page, 'Verse 3');
  await playFromRow(page, row);
  await page.waitForFunction(() => {
    const t = window.GuitarDrumAPI.getTransport();
    return t.playing && t.countIn === 0;
  });

  const accepted = await page.evaluate(() => {
    const timeline = window.GuitarDrumAPI.getSectionTimeline();
    const outro = timeline.find(section => section.name === 'Outro');
    return window.GuitarDrumAPI.requestSectionTransition(outro.index, {
      fillStyle: 'small',
      confidence: 0.95
    });
  });

  expect(accepted).toBe(true);
  await waitForNaturalEnd(page);
  const items = await history(page);
  expect(items.some(item => item.playing && item.section === 'Outro')).toBe(true);
});
