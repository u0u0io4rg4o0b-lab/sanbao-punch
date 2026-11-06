(() => {
  'use strict';

  const PRESETS = window.VENT_PRESETS || {};
  const STORAGE_KEY = 'vent-game-custom-v1';

  // Load saved custom config from localStorage if available, otherwise use VENT_INITIAL_CONFIG
  let L = JSON.parse(JSON.stringify(window.VENT_INITIAL_CONFIG || PRESETS.sanbao));
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.gameTitle && parsed.stages) L = parsed;
    }
  } catch (e) {}

  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const params = new URLSearchParams(location.search);

  const els = {
    app: $('#app'), stage: $('#stage'), dude: $('#dude'), head: $('#head'),
    faceImg: $('#faceImg'), bgVideo: $('#bgVideo'), faceOverlays: $('#faceOverlays'), face: $('#face'),
    hudTargetName: $('#hudTargetName'), bubble: $('#bubble'), who: $('#who'), bubbleText: $('#bubbleText'),
    toast: $('#toast'), combo: $('#combo'),
    flash: $('#flash'), fistL: $('#fistL'), fistR: $('#fistR'), slap: $('#slapHand'),
    hpfill: $('#hpfill'), hplag: $('#hplag'), mood: $('#mood'), mute: $('#mute'),
    start: $('#start'), startThumb: $('#startThumb'), startTitle: $('#startTitle'),
    startSub: $('#startSub'), startSummary: $('#startSummary'), startQuote: $('#startQuote'),
    go: $('#go'), result: $('#result'), confess: $('#confess'), rank: $('#rank'),
    stHits: $('#stHits'), stTime: $('#stTime'), stCombo: $('#stCombo'),
    buttons: [...document.querySelectorAll('.btn[data-move]')],
    // Studio Modal elements
    studioModal: $('#studioModal'),
    tabBtnCustom: $('#tabBtnCustom'), tabBtnAi: $('#tabBtnAi'),
    tabCustom: $('#tabCustom'), tabAi: $('#tabAi'),
    mediaUpload: $('#mediaUpload'), uploadTrigger: $('#uploadTrigger'),
    calibStage: $('#calibStage'), calibImg: $('#calibImg'), calibCross: $('#calibCross'),
    faceScale: $('#faceScale'), scaleVal: $('#scaleVal'),
    inTitle: $('#inTitle'), inTarget: $('#inTarget'), inSummary: $('#inSummary'),
    inQuote: $('#inQuote'), inShouts: $('#inShouts'), inStage0: $('#inStage0'), inConfess: $('#inConfess'),
    saveAndPlay: $('#saveAndPlay'), exportSingleHtml: $('#exportSingleHtml'),
    aiPromptBox: $('#aiPromptBox'), copyAiPrompt: $('#copyAiPrompt'),
  };

  const MOVES = {
    L: { min: 4, max: 7, anim: 'hitL', fx: ['砰！', '啪！', '碰！', '咚！'] },
    R: { min: 4, max: 7, anim: 'hitR', fx: ['砰！', '啪！', '碰！', '咚！'] },
    H: { min: 6, max: 10, anim: 'hitTop', fx: ['啪！', '巴下去！', '咚！'] },
  };
  const MOOD_COLORS = ['#e03131', '#d9480f', '#7950f2', '#1971c2', '#495057', '#2b8a3e'];
  const COMBO_WINDOW = 1300;

  let muted = localStorage.getItem('sanbao-muted') === '1';

  // Pre-recorded MP3 IDs for the default Sanbao character
  const RECORDED_SANBAO_IDS = new Set([
    'story1', 'story2', 'story3', 'story4', 'story5',
    'shout1', 'shout2', 'shout3', 'shout4', 'shout5', 'shout6', 'shout7', 'shout8', 'shout9', 'shout10',
    's0a', 's0b', 's0c', 's0d', 's0e',
    's1a', 's1b', 's1c', 's1d',
    's2a', 's2b', 's2c', 's2d',
    's3a', 's3b', 's3c', 's3d',
    'c1', 'c2', 'c3', 'c4',
  ]);

  // ---------- 1. 打擊音效（Web Audio API 即時合成，零延遲） ----------
  const Sfx = {
    ctx: null,
    unlock() {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {}
    },
    noise(dur) {
      const c = this.ctx;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      src.buffer = buf;
      return src;
    },
    punch(heavy) {
      if (!this.ctx || muted) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(heavy ? 185 : 145, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.17);
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.21);
      const n = this.noise(0.1), f = c.createBiquadFilter(), ng = c.createGain();
      f.type = 'lowpass'; f.frequency.value = heavy ? 1900 : 1200;
      ng.gain.setValueAtTime(0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      n.connect(f); f.connect(ng); ng.connect(c.destination);
      n.start(t);
    },
    slap() {
      if (!this.ctx || muted) return;
      const c = this.ctx, t = c.currentTime;
      const n = this.noise(0.085), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = 1350;
      g.gain.setValueAtTime(0.48, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      n.connect(f); f.connect(g); g.connect(c.destination);
      n.start(t);
      this.punch(true);
    },
    ding() {
      if (!this.ctx || muted) return;
      const c = this.ctx;
      for (let i = 0; i < 3; i++) {
        const t = c.currentTime + i * 0.28;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = 1320;
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + 0.28);
      }
    },
  };

  // ---------- 2. 單聲道互斥語音系統（支援預錄 MP3 與自訂台詞 Web Speech API 自動切換） ----------
  const Voice = {
    voice: null,
    current: null,
    cooldownUntil: 0,
    turn: 'player',
    hasTTS: 'speechSynthesis' in window,
    init() {
      if (this.hasTTS) {
        this.choose();
        speechSynthesis.addEventListener('voiceschanged', () => this.choose());
      }
    },
    choose() {
      const all = speechSynthesis.getVoices();
      if (!all.length) return;
      const zh = all.filter((v) => /^(zh|cmn|nan)/i.test(v.lang));
      const male = /rocko|reed|eddy|grandpa|yunjhe|zhiwei|li-?mu|yu-?shu|kang|male|男/i;
      this.voice = zh.find((v) => /TW/i.test(v.lang) && male.test(v.name))
        || zh.find((v) => male.test(v.name))
        || zh.find((v) => /TW/i.test(v.lang))
        || zh[0] || null;
    },
    busy() {
      if (this.current && !this.current.paused && !this.current.ended) return true;
      if (this.hasTTS && speechSynthesis.speaking) return true;
      return performance.now() < this.cooldownUntil;
    },
    stop() {
      if (this.current) {
        this.current.onended = null;
        this.current.onerror = null;
        this.current.pause();
        this.current = null;
      }
      if (this.hasTTS) speechSynthesis.cancel();
      this.cooldownUntil = 0;
    },
    play(line, who, onDone) {
      if (muted || !line) {
        if (onDone) setTimeout(onDone, 1200);
        return false;
      }
      if (this.busy()) return false;

      const finish = () => {
        this.current = null;
        this.cooldownUntil = performance.now() + 280;
        if (onDone) onDone();
      };

      // Only use pre-recorded MP3 if line.id is in RECORDED_SANBAO_IDS and text hasn't been custom-edited
      const defaultSanbao = PRESETS.sanbao;
      let isUnmodifiedSanbaoLine = false;
      if (line.id && RECORDED_SANBAO_IDS.has(line.id) && defaultSanbao) {
        const allDefault = [
          ...defaultSanbao.story, ...defaultSanbao.shouts,
          ...defaultSanbao.stages.flat(), ...defaultSanbao.confess,
        ];
        const match = allDefault.find((x) => x.id === line.id);
        if (match && match.text === line.text) isUnmodifiedSanbaoLine = true;
      }

      if (isUnmodifiedSanbaoLine) {
        const a = new Audio('audio/' + line.id + '.mp3');
        a.volume = 0.92;
        this.current = a;
        a.onended = finish;
        a.onerror = () => {
          this.current = null;
          this.speakFallback(line, who === 'player' ? 0.9 : 0.72, who === 'player' ? 1.15 : 1.02, finish);
        };
        a.play().catch(() => {
          this.current = null;
          this.speakFallback(line, who === 'player' ? 0.9 : 0.72, who === 'player' ? 1.15 : 1.02, finish);
        });
        return true;
      }

      this.speakFallback(line, who === 'player' ? 0.9 : 0.72, who === 'player' ? 1.15 : 1.02, finish);
      return true;
    },
    speakFallback(line, pitch, rate, onDone) {
      if (muted || !this.hasTTS) {
        if (onDone) setTimeout(onDone, 1200);
        return;
      }
      const u = new SpeechSynthesisUtterance(line.say || line.text);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else { u.lang = 'zh-TW'; }
      u.pitch = pitch;
      u.rate = rate;
      if (onDone) {
        u.onend = onDone;
        u.onerror = onDone;
      }
      speechSynthesis.speak(u);
    },
    sayDude(line, onDone) { return this.play(line, 'dude', onDone); },
    sayPlayer(line, onDone) { return this.play(line, 'player', onDone); },
    sayAllConfess(lines) {
      if (lines && lines.length) showBubble(lines[0].text, 'dude');
      this.stop();
      if (muted) return;
      let i = 0;
      const next = () => {
        if (i >= lines.length || muted || !S.over) return;
        const line = lines[i++];
        showBubble(line.text, 'dude');
        this.play(line, 'dude', () => {
          S.timers.push(setTimeout(next, 350));
        });
      };
      next();
    },
  };

  // ---------- 3. 套用角色設定（圖片／影片＋臉部傷勢座標＋文案） ----------
  function applyConfigToDOM() {
    document.title = `${L.gameTitle}｜萬用消氣遊戲工作坊`;
    els.hudTargetName.textContent = L.targetName;
    els.startTitle.textContent = L.gameTitle;
    els.startSub.textContent = L.gameSubtitle || '做錯事還態度惡劣？打到他認錯！';
    els.startSummary.textContent = L.incidentSummary;
    els.startQuote.textContent = L.incidentQuote;

    const src = L.mediaSrc || 'default-target.jpg';
    if (L.mediaType === 'video') {
      els.bgVideo.src = src;
      els.bgVideo.hidden = false;
      els.bgVideo.play().catch(() => {});
      els.faceImg.setAttribute('opacity', '0');
    } else {
      els.bgVideo.pause();
      els.bgVideo.hidden = true;
      els.faceImg.setAttribute('opacity', '1');
      els.faceImg.setAttribute('href', src);
      els.startThumb.src = src;
      els.calibImg.src = src;
    }

    // Apply faceAnchor transform relative to default (220, 135)
    const fa = L.faceAnchor || { cx: 220, cy: 135, scale: 1.0 };
    const s = fa.scale || 1.0;
    els.faceOverlays.setAttribute(
      'transform',
      `translate(${fa.cx}, ${fa.cy}) scale(${s}) translate(-220, -135)`
    );

    if (L.story && L.story.length) {
      showBubble(L.story[0].text, 'dude');
    }
  }

  // ---------- 4. 遊戲狀態與階段控制 ----------
  const S = {
    started: false, intro: false, over: false,
    hp: 100, stage: 0, hits: 0, combo: 0, maxCombo: 0,
    lastHit: 0, lastLine: 0, startT: 0, endT: 0,
    introTimer: null, timers: [], decks: [], shoutDeck: [],
  };

  function later(fn, ms) { const id = setTimeout(fn, ms); S.timers.push(id); return id; }
  function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; }

  function nextLine(stage) {
    const pool = (L.stages && L.stages[stage] && L.stages[stage].length)
      ? L.stages[stage]
      : [{ id: 'fallback', text: '好痛！別再打了！' }];
    if (!S.decks[stage] || !S.decks[stage].length) {
      S.decks[stage] = [...pool].sort(() => Math.random() - 0.5);
    }
    return S.decks[stage].pop();
  }

  function nextShout() {
    const pool = (L.shouts && L.shouts.length)
      ? L.shouts
      : [{ id: 'sh_fb', text: '做錯事還敢這麼囂張！欠教訓！' }];
    if (!S.shoutDeck.length) {
      S.shoutDeck = [...pool].sort(() => Math.random() - 0.5);
    }
    return S.shoutDeck.pop();
  }

  const stageFor = (hp) => (hp > 75 ? 0 : hp > 50 ? 1 : hp > 25 ? 2 : hp > 0 ? 3 : 4);

  function restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  }

  function setStage(n) {
    els.dude.setAttribute('data-stage', String(n));
    const moods = L.moods || ['囂張跋扈', '嘴硬狡辯', '心虛軟化', '舉旗求饒', '眼冒金星', '低頭懺悔'];
    els.mood.textContent = moods[n] || moods[0];
    els.mood.style.background = MOOD_COLORS[n] || MOOD_COLORS[0];
  }

  function showBubble(text, speaker = 'dude') {
    els.bubble.classList.toggle('player', speaker === 'player');
    els.who.textContent = speaker === 'player' ? '💢 你斥責' : `🗣️ ${L.targetName.replace(/^[^\s]+\s*/, '') || '對方'}`;
    els.bubbleText.textContent = text;
    restartAnim(els.bubble, 'pop');
  }

  function dudeSpeak(line, onDone) {
    if (!line) return false;
    S.lastLine = performance.now();
    showBubble(line.text, 'dude');
    return Voice.sayDude(line, onDone);
  }

  function toast(text) {
    if (!text) return;
    els.toast.textContent = text;
    restartAnim(els.toast, 'on');
  }

  function updateHP() {
    els.hpfill.style.width = S.hp + '%';
    els.hplag.style.width = S.hp + '%';
    els.hpfill.className = S.hp <= 25 ? 's3' : S.hp <= 50 ? 's2' : S.hp <= 75 ? 's1' : '';
  }

  function headPoint() {
    const s = els.stage.getBoundingClientRect();
    const f = els.face.getBoundingClientRect();
    return { x: f.left - s.left + f.width / 2, y: f.top - s.top + f.height * 0.45, w: f.width, h: f.height };
  }

  function spawn(cls, text, x, y) {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--r', rand(-14, 14) + 'deg');
    els.stage.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function playIntro(i) {
    if (!S.intro) return;
    if (!L.story || i >= L.story.length) { endIntro(true); return; }
    const line = L.story[i];
    dudeSpeak(line, () => {
      if (!S.intro) return;
      S.introTimer = setTimeout(() => playIntro(i + 1), 350);
    });
  }

  function endIntro(natural) {
    if (!S.intro) return;
    S.intro = false;
    clearTimeout(S.introTimer);
    Voice.stop();
    if (natural) toast('👊 聽他狡辯夠了！出拳消氣！');
  }

  function startGame() {
    Sfx.unlock();
    els.start.hidden = true;
    S.started = true;
    S.intro = true;
    playIntro(0);
  }

  function hit(move, at) {
    if (!S.started || S.over) return;
    if (S.intro) endIntro(false);

    const now = performance.now();
    if (!S.startT) S.startT = now;
    S.combo = now - S.lastHit < COMBO_WINDOW ? S.combo + 1 : 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.lastHit = now;
    S.hits++;

    const m = MOVES[move];
    let dmg = rand(m.min, m.max) + (S.combo >= 8 ? 1 : 0);
    const crit = Math.random() < 0.15;
    if (crit) dmg = Math.round(dmg * 1.6);
    S.hp = Math.max(0, S.hp - dmg);

    if (move === 'L') restartAnim(els.fistL, 'go');
    else if (move === 'R') restartAnim(els.fistR, 'go');
    else restartAnim(els.slap, 'go');

    restartAnim(els.head, m.anim);
    restartAnim(els.flash, 'on');
    if (crit || move === 'H') restartAnim(els.app, 'shake');
    els.dude.classList.add('hurt');
    setTimeout(() => els.dude.classList.remove('hurt'), 120);

    const p = headPoint();
    const bx = at ? at.x : p.x + rand(-p.w * 0.22, p.w * 0.22);
    const by = at ? at.y : p.y + (move === 'H' ? -p.h * 0.28 : rand(-p.h * 0.08, p.h * 0.14));
    spawn('burst' + (crit ? ' crit' : ''), crit ? '爆擊！' : pick(m.fx), bx, by);

    if (move === 'H') Sfx.slap(); else Sfx.punch(crit);
    if (navigator.vibrate) navigator.vibrate(crit ? [35, 25, 45] : 22);

    if (S.combo >= 2) {
      els.combo.hidden = false;
      els.combo.textContent = '🔥 ' + S.combo + ' 連擊';
      restartAnim(els.combo, 'bump');
    } else {
      els.combo.hidden = true;
    }

    updateHP();

    const ns = stageFor(S.hp);
    if (ns !== S.stage) {
      S.stage = ns;
      setStage(ns);
      if (ns === 4) { knockout(); return; }
      const stLine = nextLine(ns);
      showBubble(stLine.text, 'dude');
      if (!Voice.busy()) {
        Voice.sayDude(stLine);
        Voice.turn = 'player';
      }
      return;
    }

    if (!Voice.busy()) {
      if (Voice.turn === 'player') {
        const sh = nextShout();
        showBubble(sh.text, 'player');
        Voice.sayPlayer(sh);
        Voice.turn = 'dude';
      } else {
        const dl = nextLine(S.stage);
        dudeSpeak(dl);
        Voice.turn = 'player';
      }
    }
  }

  function knockout() {
    S.over = true;
    S.endT = performance.now();
    els.buttons.forEach((b) => { b.disabled = true; });
    Voice.stop();
    Sfx.ding();
    els.combo.hidden = true;
    showBubble('（頭昏眼花倒地中）……好痛……別再打了……', 'dude');
    els.dude.classList.add('ko');

    later(() => {
      els.dude.classList.remove('ko');
      setStage(5);
      els.dude.classList.add('bow');
      Voice.sayAllConfess(L.confess);
      later(showResult, 1300);
    }, 1500);
  }

  function rankFor(sec) {
    if (sec <= 12) return '🏆 消氣稱號：正義戰神';
    if (sec <= 22) return '🥇 消氣稱號：治惡人達人';
    if (sec <= 35) return '🥈 消氣稱號：熱血防衛者';
    return '🧘 消氣稱號：佛系講理人';
  }

  function showResult() {
    const sec = Math.max(1, Math.round((S.endT - S.startT) / 1000));
    els.confess.replaceChildren(...(L.confess || []).map((l) => {
      const p = document.createElement('p');
      p.textContent = '🙇 「' + l.text + '」';
      return p;
    }));
    els.stHits.textContent = S.hits;
    els.stTime.textContent = sec;
    els.stCombo.textContent = S.maxCombo;
    els.rank.textContent = rankFor(sec);
    els.result.hidden = false;
    S.lastResult = { sec, hits: S.hits };
  }

  function reset() {
    clearTimers();
    Voice.stop();
    Object.assign(S, {
      over: false, intro: false, hp: 100, stage: 0,
      hits: 0, combo: 0, maxCombo: 0, lastHit: 0, lastLine: 0, startT: 0, endT: 0, decks: [], shoutDeck: [],
    });
    els.dude.classList.remove('ko', 'bow');
    els.result.hidden = true;
    els.combo.hidden = true;
    els.buttons.forEach((b) => { b.disabled = false; });
    setStage(0);
    updateHP();
    dudeSpeak(L.stages[0][0]);
  }

  // ---------- 5. 🛠️ 萬用自訂工作坊（上傳照片／影片＋臉部對位＋改台詞＋匯出單檔 HTML） ----------
  let draftMediaType = L.mediaType || 'image';
  let draftMediaSrc = L.mediaSrc || 'default-target.jpg';
  let draftAnchor = { ...(L.faceAnchor || { cx: 220, cy: 135, scale: 1.0 }) };

  function updateCalibUI() {
    const pctX = Math.round((draftAnchor.cx / 473) * 100);
    const pctY = Math.round((draftAnchor.cy / 750) * 100);
    els.calibCross.style.left = pctX + '%';
    els.calibCross.style.top = pctY + '%';
    const scalePct = Math.round((draftAnchor.scale || 1) * 100);
    els.faceScale.value = String(scalePct);
    els.scaleVal.textContent = scalePct + '%';
  }

  function populateStudioForm(cfg) {
    draftMediaType = cfg.mediaType || 'image';
    draftMediaSrc = cfg.mediaSrc || 'default-target.jpg';
    draftAnchor = { ...(cfg.faceAnchor || { cx: 220, cy: 135, scale: 1.0 }) };
    if (draftMediaType === 'image') els.calibImg.src = draftMediaSrc;
    updateCalibUI();

    els.inTitle.value = cfg.gameTitle || '';
    els.inTarget.value = cfg.targetName || '';
    els.inSummary.value = cfg.incidentSummary || '';
    els.inQuote.value = cfg.incidentQuote || '';
    els.inShouts.value = (cfg.shouts || []).map((x) => x.text).join('\n');
    const st0Lines = [
      ...(cfg.story || []).map((x) => x.text),
      ...((cfg.stages && cfg.stages[0]) || []).map((x) => x.text),
    ];
    els.inStage0.value = st0Lines.slice(0, 6).join('\n');
    els.inConfess.value = (cfg.confess || []).map((x) => x.text).join('\n');
  }

  function openStudio(tab = 'custom') {
    Voice.stop();
    populateStudioForm(L);
    switchTab(tab);
    els.studioModal.hidden = false;
  }

  function closeStudio() {
    els.studioModal.hidden = true;
  }

  function switchTab(tab) {
    const isCustom = tab === 'custom';
    els.tabBtnCustom.classList.toggle('on', isCustom);
    els.tabBtnAi.classList.toggle('on', !isCustom);
    els.tabCustom.hidden = !isCustom;
    els.tabAi.hidden = isCustom;
  }

  // Preset buttons
  document.querySelectorAll('.chip[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      const copy = JSON.parse(JSON.stringify(p));
      // Keep user's uploaded photo if they already uploaded one
      if (draftMediaSrc && draftMediaSrc !== 'default-target.jpg') {
        copy.mediaType = draftMediaType;
        copy.mediaSrc = draftMediaSrc;
        copy.faceAnchor = draftAnchor;
      }
      populateStudioForm(copy);
      L = copy;
      toast(`⚡ 已載入「${p.gameTitle}」範本！`);
    });
  });

  // Upload photo or video
  els.uploadTrigger.addEventListener('click', () => els.mediaUpload.click());
  els.mediaUpload.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      draftMediaType = 'video';
      draftMediaSrc = url;
      // Also capture a frame for calibration thumbnail
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.addEventListener('loadeddata', () => {
        v.currentTime = Math.min(0.5, v.duration || 0);
      });
      v.addEventListener('seeked', () => {
        const c = document.createElement('canvas');
        c.width = 473; c.height = 750;
        const ctx = c.getContext('2d');
        ctx.drawImage(v, 0, 0, 473, 750);
        els.calibImg.src = c.toDataURL('image/jpeg', 0.85);
      });
      toast('🎬 已載入短影片！可點擊預覽圖校準臉部位置');
      return;
    }

    // Image upload -> compress & center-crop onto 473x750 canvas DataURL
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 473;
        c.height = 750;
        const ctx = c.getContext('2d');
        const targetRatio = 473 / 750;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = 0; // align top so head is preserved
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 473, 750);
        const dataUrl = c.toDataURL('image/jpeg', 0.86);
        draftMediaType = 'image';
        draftMediaSrc = dataUrl;
        els.calibImg.src = dataUrl;
        toast('📸 照片已載入！請點擊預覽圖中對方的鼻樑校準傷勢位置');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // Click on calibration preview to set face center (cx, cy)
  els.calibStage.addEventListener('pointerdown', (e) => {
    const r = els.calibStage.getBoundingClientRect();
    const xRatio = Math.max(0.15, Math.min(0.85, (e.clientX - r.left) / r.width));
    const yRatio = Math.max(0.1, Math.min(0.75, (e.clientY - r.top) / r.height));
    draftAnchor.cx = Math.round(xRatio * 473);
    draftAnchor.cy = Math.round(yRatio * 750);
    updateCalibUI();
  });

  els.faceScale.addEventListener('input', () => {
    draftAnchor.scale = Number(els.faceScale.value) / 100;
    els.scaleVal.textContent = els.faceScale.value + '%';
  });

  function buildConfigFromForm() {
    const splitLines = (txt, prefix) => txt
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, idx) => ({ id: `${prefix}_${idx + 1}`, text, say: text }));

    const shoutArr = splitLines(els.inShouts.value, 'cust_sh');
    const stage0Arr = splitLines(els.inStage0.value, 'cust_s0');
    const confessArr = splitLines(els.inConfess.value, 'cust_c');

    return {
      ...L,
      gameTitle: els.inTitle.value.trim() || '專屬消氣拳',
      gameSubtitle: '做錯事還態度惡劣？打到他認錯懺悔！',
      targetName: els.inTarget.value.trim() || '😤 討厭的傢伙',
      mediaType: draftMediaType,
      mediaSrc: draftMediaSrc,
      faceAnchor: { ...draftAnchor },
      incidentSummary: els.inSummary.value.trim() || L.incidentSummary,
      incidentQuote: els.inQuote.value.trim() || L.incidentQuote,
      story: stage0Arr.length ? stage0Arr.slice(0, 3) : L.story,
      shouts: shoutArr.length ? shoutArr : L.shouts,
      stages: [
        stage0Arr.length ? stage0Arr : L.stages[0],
        L.stages[1],
        L.stages[2],
        L.stages[3],
      ],
      confess: confessArr.length ? confessArr : L.confess,
    };
  }

  els.saveAndPlay.addEventListener('click', () => {
    L = buildConfigFromForm();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(L)); } catch (e) {}
    applyConfigToDOM();
    closeStudio();
    els.start.hidden = true;
    S.started = true;
    reset();
    toast('✅ 已套用自訂照片與台詞！開始出拳消氣！');
  });

  // Export single-file standalone HTML right from the browser!
  els.exportSingleHtml.addEventListener('click', async () => {
    L = buildConfigFromForm();
    applyConfigToDOM();
    try {
      const cssRes = await fetch('style.css').catch(() => null);
      const cssText = cssRes && cssRes.ok ? await cssRes.text() : document.querySelector('style')?.textContent || '';
      const engRes = await fetch('engine.js').catch(() => null);
      const engText = engRes && engRes.ok ? await engRes.text() : '';

      const cfgScript = `window.VENT_PRESETS = ${JSON.stringify(PRESETS)};\nwindow.VENT_INITIAL_CONFIG = ${JSON.stringify(L)};\n`;
      const docClone = document.documentElement.cloneNode(true);
      // Clean transient runtime states in clone
      const htmlRaw = '<!doctype html>\n<html lang="zh-Hant-TW">\n' + docClone.innerHTML + '\n</html>';
      const bundled = htmlRaw
        .replace('<link rel="stylesheet" href="style.css">', `<style>\n${cssText}\n</style>`)
        .replace('<script src="config.js"></script>', `<script>\n${cfgScript}\n</script>`)
        .replace('<script src="engine.js"></script>', engText ? `<script>\n${engText}\n</script>` : '');

      const blob = new Blob([bundled], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${L.gameTitle || '專屬消氣拳'}_單檔版.html`;
      a.click();
      toast('💾 已匯出專屬單檔 HTML！可直接傳給朋友點開玩');
    } catch (e) {
      toast('⚠️ 匯出失敗，請直接分享網址給朋友');
    }
  });

  els.copyAiPrompt.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.aiPromptBox.value);
      toast('✅ 已複製 AI 啟動指令！貼給 Claude / Codex / 本地 LLM 即可');
    } catch (e) {
      els.aiPromptBox.select();
    }
  });

  // ---------- 6. LINE 好友分享 ----------
  function cleanUrl() {
    const u = new URL(location.href);
    u.hash = '';
    ['openExternalBrowser', 'stage', 'auto', 'studio'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  }

  function shareText() {
    const r = S.lastResult;
    return r
      ? `我花了 ${r.sec} 秒、痛扁 ${r.hits} 拳，把「${L.targetName}」打到舉白旗懺悔了！🥊 你也可以上傳照片做自己的消氣遊戲👇`
      : `「${L.gameTitle}」手機點開直接出拳消氣！還可以上傳照片＋改台詞做你專屬的發洩遊戲 🥊👇`;
  }

  function shareLine() {
    const url = 'https://line.me/R/share?text=' + encodeURIComponent(shareText() + '\n' + cleanUrl());
    window.open(url, '_blank');
  }

  async function shareMore() {
    const data = { title: document.title, text: shareText(), url: cleanUrl() };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(data.text + '\n' + data.url);
      toast('✅ 已複製遊戲連結！直接貼到 LINE 傳給朋友吧');
    } catch (e) {
      window.prompt('請複製以下連結傳給 LINE 好友：', data.url);
    }
  }

  // ---------- 7. 事件綁定 ----------
  els.go.addEventListener('click', startGame);
  $('#again').addEventListener('click', reset);
  $('#shareLine').addEventListener('click', shareLine);
  $('#share').addEventListener('click', shareMore);

  $('#openStudioTop').addEventListener('click', () => openStudio('custom'));
  $('#openStudioStart').addEventListener('click', () => openStudio('custom'));
  $('#openAiTabStart').addEventListener('click', () => openStudio('ai'));
  $('#openStudioResult').addEventListener('click', () => openStudio('custom'));
  $('#closeStudio').addEventListener('click', closeStudio);
  els.tabBtnCustom.addEventListener('click', () => switchTab('custom'));
  els.tabBtnAi.addEventListener('click', () => switchTab('ai'));

  els.buttons.forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('press');
      hit(b.dataset.move);
    });
    const up = () => b.classList.remove('press');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
  });

  els.dude.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const s = els.stage.getBoundingClientRect();
    const f = els.face.getBoundingClientRect();
    const x = e.clientX - s.left, y = e.clientY - s.top;
    const move = e.clientY < f.top + f.height * 0.28 ? 'H' : e.clientX < f.left + f.width / 2 ? 'L' : 'R';
    hit(move, { x, y });
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat || !els.studioModal.hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') hit('L');
    else if (k === 'arrowright' || k === 'd') hit('R');
    else if (k === 'arrowup' || k === 'w' || k === ' ') hit('H');
  });

  function renderMute() { els.mute.textContent = muted ? '🔇' : '🔊'; }
  els.mute.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem('sanbao-muted', muted ? '1' : '0');
    if (muted) Voice.stop(); else Sfx.unlock();
    renderMute();
  });

  if (/\bLine\//i.test(navigator.userAgent)) {
    const u = new URL(location.href);
    u.searchParams.set('openExternalBrowser', '1');
    $('#extLink').href = u.toString();
    $('#inapp').hidden = false;
  }

  Voice.init();
  renderMute();
  applyConfigToDOM();
  setStage(0);
  updateHP();

  // 預覽與自動化驗證參數：?stage=0..5 或 ?auto=1 或 ?studio=custom|ai
  const studioParam = params.get('studio');
  if (studioParam === 'custom' || studioParam === 'ai') {
    els.start.hidden = true;
    openStudio(studioParam);
  }
  const previewStage = params.get('stage');
  if (previewStage !== null && /^[0-5]$/.test(previewStage)) {
    els.start.hidden = true;
    const st = Number(previewStage);
    const hpMap = [100, 75, 50, 25, 0, 0];
    S.hp = hpMap[st];
    S.stage = st;
    updateHP();
    setStage(st);
    if (st === 5) els.dude.classList.add('bow');
    showBubble(st < 4 ? L.stages[st][0].text : L.confess[0].text, 'dude');
  }
  if (params.get('auto') === '1') {
    muted = true;
    els.start.hidden = true;
    S.started = true;
    const order = ['L', 'R', 'H'];
    let i = 0;
    const iv = setInterval(() => {
      if (S.over) { clearInterval(iv); return; }
      hit(order[i++ % 3]);
    }, 170);
  }

  window.__sanbao = { S, hit, reset, stageFor, openStudio };
})();
