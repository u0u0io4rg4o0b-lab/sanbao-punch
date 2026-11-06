(() => {
  'use strict';

  const L = window.GAME_LINES;
  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const params = new URLSearchParams(location.search);

  const els = {
    app: $('#app'), stage: $('#stage'), dude: $('#dude'), head: $('#head'), face: $('#face'),
    bubble: $('#bubble'), who: $('#who'), bubbleText: $('#bubbleText'),
    toast: $('#toast'), combo: $('#combo'),
    flash: $('#flash'), fistL: $('#fistL'), fistR: $('#fistR'), slap: $('#slapHand'),
    hpfill: $('#hpfill'), hplag: $('#hplag'), mood: $('#mood'), mute: $('#mute'),
    start: $('#start'), go: $('#go'), result: $('#result'), confess: $('#confess'), rank: $('#rank'),
    stHits: $('#stHits'), stTime: $('#stTime'), stCombo: $('#stCombo'),
    buttons: [...document.querySelectorAll('.btn[data-move]')],
  };

  const MOVES = {
    L: { min: 4, max: 7, anim: 'hitL', fx: ['砰！', '啪！', '碰！', '咚！'] },
    R: { min: 4, max: 7, anim: 'hitR', fx: ['砰！', '啪！', '碰！', '咚！'] },
    H: { min: 6, max: 10, anim: 'hitTop', fx: ['啪！', '巴下去！', '咚！'] },
  };
  const MOOD_COLORS = ['#e03131', '#d9480f', '#7950f2', '#1971c2', '#495057', '#2b8a3e'];
  const COMBO_WINDOW = 1300;

  let muted = localStorage.getItem('sanbao-muted') === '1';

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

  // ---------- 2. 單聲道互斥語音系統（正在講話時絕不插入第二個聲音） ----------
  const ALL_IDS = [
    ...L.story, ...L.shouts, ...L.stages.flat(), ...L.confess,
  ].map((x) => x.id);

  const Voice = {
    voice: null,
    recorded: new Set(ALL_IDS),
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

      if (this.recorded.has(line.id)) {
        const a = new Audio('audio/' + line.id + '.mp3');
        a.volume = 0.92;
        this.current = a;
        a.onended = finish;
        a.onerror = () => {
          this.current = null;
          this.speakFallback(line, who === 'player' ? 0.85 : 0.65, who === 'player' ? 1.2 : 1.0, finish);
        };
        a.play().catch(() => {
          this.current = null;
          this.speakFallback(line, who === 'player' ? 0.85 : 0.65, who === 'player' ? 1.2 : 1.0, finish);
        });
        return true;
      }
      this.speakFallback(line, who === 'player' ? 0.85 : 0.65, who === 'player' ? 1.2 : 1.0, finish);
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
    sayDude(line, onDone) {
      return this.play(line, 'dude', onDone);
    },
    sayPlayer(line, onDone) {
      return this.play(line, 'player', onDone);
    },
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

  // ---------- 3. 遊戲狀態與階段控制 ----------
  const S = {
    started: false, intro: false, over: false,
    hp: 100, stage: 0, hits: 0, combo: 0, maxCombo: 0,
    lastHit: 0, lastLine: 0, startT: 0, endT: 0,
    introTimer: null, timers: [], decks: [], shoutDeck: [],
  };

  function later(fn, ms) { const id = setTimeout(fn, ms); S.timers.push(id); return id; }
  function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; }

  function nextLine(stage) {
    if (!S.decks[stage] || !S.decks[stage].length) {
      S.decks[stage] = [...L.stages[stage]].sort(() => Math.random() - 0.5);
    }
    return S.decks[stage].pop();
  }

  function nextShout() {
    if (!S.shoutDeck.length) {
      S.shoutDeck = [...L.shouts].sort(() => Math.random() - 0.5);
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
    els.mood.textContent = L.moods[n];
    els.mood.style.background = MOOD_COLORS[n];
  }

  function showBubble(text, speaker = 'dude') {
    els.bubble.classList.toggle('player', speaker === 'player');
    els.who.textContent = speaker === 'player' ? '💢 你斥責' : '🗣️ 三寶阿伯';
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

  // ---------- 4. 開場：三寶依序講完上一句才講下一句（出拳即刻停止開場） ----------
  function playIntro(i) {
    if (!S.intro) return;
    if (i >= L.story.length) { endIntro(true); return; }
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

  // ---------- 5. 玩家攻擊互動（統一對白欄呈現，不重疊語音、不遮臉） ----------
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

    // 階段狀態變化
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

    // 一般出拳：只有在目前完全沒有語音播放中時，才切換下一句語音與對白
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

  // ---------- 6. K.O. 擊倒 → 低頭懺悔 ----------
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
    if (sec <= 12) return '🏆 消氣稱號：馬路正義戰神';
    if (sec <= 22) return '🥇 消氣稱號：治三寶達人';
    if (sec <= 35) return '🥈 消氣稱號：熱血防衛車主';
    return '🧘 消氣稱號：佛系講理車主';
  }

  function showResult() {
    const sec = Math.max(1, Math.round((S.endT - S.startT) / 1000));
    els.confess.replaceChildren(...L.confess.map((l) => {
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
      hits: 0, combo: 0, maxCombo: 0, lastHit: 0, lastLine: 0, startT: 0, endT: 0, decks: [],
    });
    els.dude.classList.remove('ko', 'bow');
    els.result.hidden = true;
    els.combo.hidden = true;
    els.buttons.forEach((b) => { b.disabled = false; });
    setStage(0);
    updateHP();
    dudeSpeak(L.stages[0][0]);
  }

  // ---------- 7. LINE 好友一鍵分享 ----------
  function cleanUrl() {
    const u = new URL(location.href);
    u.hash = '';
    ['openExternalBrowser', 'stage', 'auto'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  }

  function shareText() {
    const r = S.lastResult;
    return r
      ? `我花了 ${r.sec} 秒、痛扁 ${r.hits} 拳，把從後面追撞還嗆聲的三寶打到舉白旗懺悔了！🥊 點開直接玩👇`
      : '從後面追撞還態度惡劣的三寶！點開手機直接出拳打到他認錯懺悔 🥊👇';
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

  // ---------- 8. 事件綁定 ----------
  els.go.addEventListener('click', startGame);
  $('#again').addEventListener('click', reset);
  $('#shareLine').addEventListener('click', shareLine);
  $('#share').addEventListener('click', shareMore);

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

  // 直接點擊照片臉部也可攻擊
  els.dude.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const s = els.stage.getBoundingClientRect();
    const f = els.face.getBoundingClientRect();
    const x = e.clientX - s.left, y = e.clientY - s.top;
    const move = e.clientY < f.top + f.height * 0.28 ? 'H' : e.clientX < f.left + f.width / 2 ? 'L' : 'R';
    hit(move, { x, y });
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
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
  setStage(0);
  updateHP();

  // 預覽與自動化驗證參數：?stage=0..5 或 ?auto=1
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

  window.__sanbao = { S, hit, reset, stageFor };
})();
