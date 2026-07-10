/* ============================================================
   AI·衣境 — 交互逻辑 + GSAP 动画
   ============================================================ */
(function () {
  'use strict';
  const gsap = window.gsap;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

  /* ---------- 后端 API（v5：所有 mock 从服务端拉；断网时退回本地兜底） ---------- */
  const API = {
    async createSession() {
      const r = await fetch('/api/session', { method: 'POST' });
      return r.json();
    },
    async analyzeImage(sessionId, image) {
      const r = await fetch('/api/analyze-image', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, image: image || null }),
      });
      return r.json();
    },
    async report(sessionId) {
      const r = await fetch('/api/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      return r.json();
    },
    async questions() { return (await fetch('/api/questions')).json(); },
    async garments(style) {
      const q = style && style !== 'all' ? `?style=${encodeURIComponent(style)}` : '';
      return (await fetch('/api/garments' + q)).json();
    },
    async scan(excludeIds) {
      const r = await fetch('/api/scan', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ excludeIds }),
      });
      return r.json();
    },
    async outfitGenerate(sessionId, payload) {
      const r = await fetch('/api/outfit/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, ...payload }),
      });
      return r.json();
    },
    async advisorGenerate(sessionId, personImage) {
      const r = await fetch('/api/advisor/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, personImage: personImage || undefined }),
      });
      return r.json();
    },
    async saveLook(sessionId, outfitIds) {
      const r = await fetch('/api/save-look', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, outfitIds }),
      });
      return r.json();
    },
  };

  /* ---------- 兜底数据（后端返回后被覆盖） ---------- */
  let GARMENTS = [
    { id: 'g1', title: '条纹落肩T恤套装',     style: '休闲', swatch: '#2A231F', tag: 'CASUAL',  image: '/looks/advisor/01%20%E5%A5%97%E8%A3%85.jpg' },
    { id: 'g2', title: '宝蓝印花泡泡袖连衣裙', style: '优雅', swatch: '#1F3AA0', tag: 'ELEGANT', image: '/looks/advisor/02%20%E8%A3%99%E5%AD%90.jpg' },
    { id: 'g3', title: '棕格纹蕾丝挂脖裙',     style: '复古', swatch: '#5C4A3A', tag: 'VINTAGE', image: '/looks/advisor/03%20%E8%A3%99%E5%AD%90.jpg' },
    { id: 'g4', title: '橄榄绿系带风衣',       style: '简约', swatch: '#8D8A6C', tag: 'MINIMAL', image: '/looks/advisor/05%20%E5%A4%A7%E8%A1%A3.jpg' },
    { id: 'g5', title: '水墨老花印花衬衫',     style: '前卫', swatch: '#5E7CB8', tag: 'AVANT',   image: '/looks/advisor/1.jpg' },
    { id: 'g6', title: '字母印花黑T',           style: '休闲', swatch: '#0E0E10', tag: 'CASUAL',  image: '/looks/advisor/2.webp' },
    { id: 'g7', title: '藏青老花渐变T恤',       style: '前卫', swatch: '#1B2F52', tag: 'AVANT',   image: '/looks/advisor/3.jpg' },
  ];

  let QUESTIONS = [
    { q: '您今天，主要是什么场合？', key: 'occasion', opts: ['聚会', '商务', '约会', '都可以'] },
    { q: '您偏好，哪种风格？', key: 'style', opts: ['简约', '优雅', '休闲', '复古', '前卫', '都可以'] },
    { q: '有什么，是您不喜欢的？', key: 'avoid', opts: ['不穿短裙', '不要亮色', '不要动物纹理', '没有'] },
  ];

  let RESULTS = [
    { title: '秋日呢子大衣', style: '韩式 · 莫兰迪', color1: '#E7D4C5', color2: '#C9A88A' },
    { title: '丝缎晚装套装', style: '优雅 · 暮光玫瑰', color1: '#E8CFC4', color2: '#B86A55' },
    { title: '廓形针织造型', style: '简约 · 暖陶土', color1: '#D9C7B2', color2: '#9A7B52' },
  ];

  const LOADING_MSGS = ['正在分析您的人脸…', '正在查看您的骨骼…', '正在查看您的精神面貌…', '正在查看您的气质…'];
  const GEN_MSGS = ['正在根据您的气质，为您专属努力中…', '正在为您搭配最适合的造型…', '马上就好，精彩即将呈现…'];

  /* ---------- 状态 ---------- */
  const state = {
    sessionId: null,
    page: 'page-capture',
    branch: null,
    answers: {},
    qIdx: 0,
    picked: [],
    filterStyle: 'all',
    resultIdx: 0,
    countdownTimer: null,
    masterTl: null,
    reportSegments: null,
    shareUrl: null,
    capturedImage: null,
  };

  /* ============================================================
     页面切换（CSS transition 接管淡入淡出，GSAP 做内部入场）
     ============================================================ */
  const STEPS = {
    'page-capture': 'STEP 01 · 形象采集',
    'page-select': 'STEP 02 · 选择方式',
    'page-advisor': 'STEP 03 · 穿搭顾问',
    'page-confirm': 'STEP 04 · 确认偏好',
    'page-shop': 'STEP 03 · 自由穿搭',
    'page-shopconfirm': 'STEP 04 · 确认穿搭',
    'page-generate': 'STEP 05 · 生成中',
    'page-result': 'RESULT · 造型方案',
  };

  function go(pageId) {
    const cur = $('.page.is-active');
    const next = document.getElementById(pageId);
    if (!next || cur === next) return;
    if (cur) cur.classList.remove('is-active');
    next.classList.add('is-active');
    // 更新品牌栏步骤
    const meta = $('#brandMeta');
    if (meta) gsap.fromTo(meta, { autoAlpha: 0, y: -4 }, { autoAlpha: 1, y: 0, duration: .5, delay: .2 });
    meta.textContent = STEPS[pageId] || '';
    onPageEnter(pageId);
  }

  function onPageEnter(id) {
    state.page = id;
    // 清理倒计时
    if (id !== 'page-result' && state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }

    const map = {
      'page-capture': enterCapture,
      'page-select': enterSelect,
      'page-advisor': enterAdvisor,
      'page-confirm': enterConfirm,
      'page-shop': enterShop,
      'page-shopconfirm': enterShopConfirm,
      'page-generate': enterGenerate,
      'page-result': enterResult,
    };
    const fn = map[id];
    if (fn) setTimeout(fn, 120);
  }

  // 通用：页面内 .reveal 元素错峰入场
  function revealIn(scope, sel = '.reveal', extra = {}) {
    const els = $$(sel, scope);
    if (!els.length) return;
    gsap.fromTo(els, { y: 18, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: .7, stagger: .08, ease: 'power3.out', ...extra });
  }

  /* ============================================================
     ① 形象采集页
     ============================================================ */
  function enterCapture() {
    const scope = $('#page-capture');
    // 若之前开过摄像头，回到首页时复位
    stopCamera();
    scope.classList.remove('cam-on');
    $('#mirrorView').classList.remove('is-camera');
    $('#captureBtn').style.display = '';
    // 扫描线动画
    const scan = $('.scan-line', scope);
    gsap.killTweensOf(scan);
    gsap.set(scan, { autoAlpha: 0, top: '0%' });
    gsap.to(scan, { autoAlpha: 1, duration: .4, delay: .3 });
    gsap.to(scan, { top: '100%', duration: 2.4, ease: 'power1.inOut', repeat: -1, yoyo: true, delay: .3 });
    revealIn(scope, '.hint-eyebrow, .hint-title, .hint-sub, .capture-btn, .capture-deco-tl, .capture-deco-br', { delay: .15 });
  }

  /* ---------- 摄像头 ---------- */
  let mediaStream = null;

  async function openCamera() {
    const video = $('#mirrorVideo');
    const view = $('#mirrorView');
    const scope = $('#page-capture');

    // 每次尝试先清掉可能残留的错误态
    view.classList.remove('has-error');

    // 浏览器策略：getUserMedia 只在 HTTPS 或 localhost 下可用
    const secure = window.isSecureContext ||
      ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (!secure) {
      return showCameraError(
        '摄像头需要 HTTPS 或 localhost',
        `当前地址：${location.protocol}//${location.host}`
      );
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showCameraError('当前浏览器不支持摄像头 API', navigator.userAgent);
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: false,
      });
      video.srcObject = mediaStream;
      await video.play();
      view.classList.add('is-camera');
      scope.classList.add('cam-on');
      // 停掉装饰扫描线（视觉太抢，取景框角标接替）
      gsap.killTweensOf('.scan-line');
      gsap.to('.scan-line', { autoAlpha: 0, duration: .3 });
      // 快门按钮 + 相机提示错峰入场
      gsap.fromTo('#camHint', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .5, delay: .15 });
      gsap.fromTo('#shutterRow', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: .55, delay: .25 });
    } catch (err) {
      console.warn('[camera] getUserMedia error:', err.name, err.message, err);
      const hint = {
        NotAllowedError:   '摄像头权限被拒绝，请在地址栏左侧解锁摄像头权限后重试',
        NotFoundError:     '没有检测到摄像头设备',
        NotReadableError:  '摄像头被其他程序占用（腾讯会议 / OBS / Zoom 等），请关掉后重试',
        OverconstrainedError: '摄像头不满足要求（分辨率或朝向）',
        SecurityError:     '浏览器安全策略拒绝，需 HTTPS 或 localhost',
        AbortError:        '摄像头启动被中断，请重试',
      }[err.name] || '摄像头启动失败';
      showCameraError(hint, `${err.name || 'CameraError'}: ${err.message}`);
    }
  }

  function showCameraError(msg, diag) {
    const view = $('#mirrorView');
    $('#camErrorMsg').textContent = msg;
    $('#camErrorDiag').textContent = diag || '';
    view.classList.remove('is-camera');
    view.classList.add('has-error');
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    const video = $('#mirrorVideo');
    if (video) video.srcObject = null;
  }

  function takePhoto() {
    const video = $('#mirrorVideo');
    const canvas = $('#mirrorCanvas');
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    // 抓帧与预览一致：仅左右镜像，不旋转
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(-1, 1);
    ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    state.capturedImage = dataUrl;
    // 快门闪一下
    const flash = $('#shutterFlash');
    gsap.set(flash, { autoAlpha: 0 });
    gsap.to(flash, { autoAlpha: .9, duration: .08, yoyo: true, repeat: 1, ease: 'power2.out' });
    stopCamera();
    setTimeout(() => startReport(dataUrl), 220);
  }

  $('#captureBtn').addEventListener('click', openCamera);
  $('#shutterBtn').addEventListener('click', takePhoto);
  $('#camCancel').addEventListener('click', () => {
    stopCamera();
    const scope = $('#page-capture');
    const view = $('#mirrorView');
    scope.classList.remove('cam-on');
    view.classList.remove('is-camera');
    // 恢复扫描线 + 原按钮
    gsap.to('.scan-line', { autoAlpha: 1, duration: .3 });
    gsap.to('.scan-line', { top: '100%', duration: 2.4, ease: 'power1.inOut', repeat: -1, yoyo: true });
  });

  let loadingTl = null;
  function startReport(capturedImage) {
    const layer = $('#reportLayer');
    layer.classList.add('show');
    const loading = $('#reportLoading');
    loading.classList.add('show');
    buildLoadingOrb();
    const bar = $('#loadingBar');
    const pct = $('#loadingPct');
    const label = $('#loadingLabel');
    const prog = { v: 0 };

    // 并行触发后端：分析图像（若有）+ 生成报告文案
    const backendReady = Promise.all([
      API.analyzeImage(state.sessionId, capturedImage || null).catch(() => null),
      API.report(state.sessionId).then(r => { state.reportSegments = r.segments || null; }).catch(() => {}),
    ]);

    const tl = gsap.timeline();
    tl.to(prog, {
      v: 100, duration: 5, ease: 'power1.inOut',
      onUpdate() {
        const v = Math.round(prog.v);
        bar.style.width = v + '%';
        pct.textContent = v + '%';
        const idx = Math.min(LOADING_MSGS.length - 1, Math.floor(v / 26));
        if (label.dataset.idx != idx) {
          label.dataset.idx = idx;
          gsap.to(label, { autoAlpha: 0, y: -6, duration: .2, ease: 'power2.in',
            onComplete() { label.textContent = LOADING_MSGS[idx]; gsap.to(label, { autoAlpha: 1, y: 0, duration: .4, ease: 'power2.out' }); } });
        }
      }
    });
    tl.add(() => {
      backendReady.finally(() => {
        stopLoadingOrb(); loading.classList.remove('show'); showReportModal();
      });
    });
  }

  function buildLoadingOrb() {
    const partG = $('#orbParticles');
    if (partG && !partG.childElementCount) {
      for (let i = 0; i < 6; i++) {
        const c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('r', 1.6);
        c.setAttribute('fill', i % 2 ? '#B86A55' : '#9A7B52');
        partG.appendChild(c);
      }
    }
    loadingTl = gsap.timeline();
    const O = '50% 50%';
    loadingTl.to('.orb-rings .r1', { rotation: 360, transformOrigin: O, duration: 16, repeat: -1, ease: 'none' }, 0);
    loadingTl.to('.orb-rings .r2', { rotation: -360, transformOrigin: O, duration: 12, repeat: -1, ease: 'none' }, 0);
    loadingTl.to('.orb-rings .r3', { rotation: 360, transformOrigin: O, duration: 10, repeat: -1, ease: 'none' }, 0);
    loadingTl.to('.orb-rings .r4', { rotation: -360, transformOrigin: O, duration: 8, repeat: -1, ease: 'none' }, 0);
    loadingTl.to('.orb-rings .r5', { rotation: 360, transformOrigin: O, duration: 6, repeat: -1, ease: 'none' }, 0);
    loadingTl.to('.orb-rings .r1', { opacity: .12, duration: 3.2, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0);
    loadingTl.to('.orb-rings .r3', { opacity: .2, duration: 2.8, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0);
    loadingTl.to('.orb-rings .r5', { opacity: .28, duration: 2.2, ease: 'sine.inOut', repeat: -1, yoyo: true }, 0);
    loadingTl.to('.orb-core', { scale: 1.45, duration: 1.4, ease: 'sine.inOut', repeat: -1, yoyo: true, transformOrigin: 'center' }, 0);
    loadingTl.fromTo('.orb-core-glow', { scale: 1, autoAlpha: .35 }, { scale: 1.6, autoAlpha: .04, duration: 1.8, ease: 'sine.inOut', repeat: -1, yoyo: true, transformOrigin: 'center' }, 0);
    const parts = $$('#orbParticles circle');
    parts.forEach((p, i) => {
      const R = 92 - i * 7;
      const dur = 2.8 + i * 0.5;
      const state = { a: i * 1.1 };
      loadingTl.to(state, { a: state.a + Math.PI * 2, duration: dur, repeat: -1, ease: 'none',
        onUpdate() { p.setAttribute('cx', 100 + Math.cos(state.a) * R); p.setAttribute('cy', 100 + Math.sin(state.a) * R); } }, 0);
    });
  }

  function stopLoadingOrb() {
    if (loadingTl) { loadingTl.kill(); loadingTl = null; }
  }

  function showReportModal() {
    const modal = $('#reportModal');
    // 若后端返回文案，覆盖硬编码
    if (Array.isArray(state.reportSegments) && state.reportSegments.length) {
      const body = $('#reportBody');
      body.innerHTML = state.reportSegments.map((t, i) => `
        <div class="report-seg${i === state.reportSegments.length - 1 ? ' seg-guide' : ''}">
          <span class="seg-no">${String(i + 1).padStart(2, '0')}</span>
          <div class="seg-text">${t}</div>
        </div>`).join('');
    }
    modal.classList.add('show');
    gsap.fromTo($('.modal-card', modal), { y: 30, autoAlpha: 0, scale: .96 },
      { y: 0, autoAlpha: 1, scale: 1, duration: .6, ease: 'power3.out' });
    gsap.fromTo('.report-seg', { y: 16, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: .5, stagger: .1, delay: .2, ease: 'power2.out' });
  }

  function closeReport() {
    const modal = $('#reportModal');
    const layer = $('#reportLayer');
    gsap.to($('.modal-card', modal), { y: 20, autoAlpha: 0, scale: .97, duration: .35, ease: 'power2.in',
      onComplete() { modal.classList.remove('show'); layer.classList.remove('show'); } });
    // 采集页淡出，进入功能选择
    setTimeout(() => go('page-select'), 250);
  }
  $('#reportClose').addEventListener('click', closeReport);
  $('#reportOk').addEventListener('click', closeReport);

  /* ============================================================
     ③ 功能选择页（斜分法）
     ============================================================ */
  function enterSelect() {
    const scope = $('#page-select');
    revealIn(scope, '.intro-eyebrow, .intro-title', { delay: .1 });
    gsap.fromTo('.split-a', { x: -30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .7, delay: .25, ease: 'power3.out' });
    gsap.fromTo('.split-b', { x: 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .7, delay: .35, ease: 'power3.out' });
    gsap.fromTo('.split-divider', { autoAlpha: 0 }, { autoAlpha: .4, duration: .8, delay: .5 });
  }
  $$('.split-shape').forEach(el => el.addEventListener('click', () => {
    const target = el.dataset.go;
    state.branch = target;
    if (target === 'advisor') go('page-advisor');
    if (target === 'shop') go('page-shop');
  }));

  /* ============================================================
     ④ 智能穿搭顾问 — 抽象动态视觉
     ============================================================ */
  function buildAdvisorVisual() {
    const barsG = $('#waveBars');
    const partsG = $('#particles');
    if (barsG.childElementCount) return; // 只构建一次

    // 径向音波条（围绕中心）
    const N = 56, R = 120;
    const bars = [];
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const cx = 300 + Math.cos(ang) * R;
      const cy = 300 + Math.sin(ang) * R;
      const rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('x', cx - 1.2);
      rect.setAttribute('y', cy - 14);
      rect.setAttribute('width', 2.4);
      rect.setAttribute('height', 28);
      rect.setAttribute('rx', 1.2);
      rect.setAttribute('transform', `rotate(${ang * 180 / Math.PI + 90} ${cx} ${cy})`);
      barsG.appendChild(rect);
      bars.push(rect);
    }
    // 音波呼吸
    gsap.to(bars, {
      attr: { height: () => gsap.utils.random(10, 64) },
      duration: 1.1, ease: 'sine.inOut',
      stagger: { each: .025, from: 'center', repeat: -1, yoyo: true },
    });

    // 漂浮粒子
    for (let i = 0; i < 18; i++) {
      const c = document.createElementNS(SVGNS, 'circle');
      const r = gsap.utils.random(1, 2.6);
      c.setAttribute('cx', gsap.utils.random(120, 480));
      c.setAttribute('cy', gsap.utils.random(120, 480));
      c.setAttribute('r', r);
      c.setAttribute('fill', i % 3 === 0 ? '#B86A55' : '#9A7B52');
      c.setAttribute('opacity', gsap.utils.random(0.2, 0.6));
      partsG.appendChild(c);
      gsap.to(c, {
        attr: { cx: '+=' + gsap.utils.random(-30, 30), cy: '+=' + gsap.utils.random(-30, 30) },
        duration: gsap.utils.random(3, 6), ease: 'sine.inOut',
        repeat: -1, yoyo: true, delay: gsap.utils.random(0, 2),
      });
    }

    // 同心圆旋转
    gsap.to('.orbit', { rotation: 360, transformOrigin: '300px 300px', duration: gsap.utils.random(40, 80), repeat: -1, ease: 'none', stagger: -8 });
    // 光晕呼吸
    gsap.to('.aura', { scale: 1.08, transformOrigin: '300px 300px', duration: 4, ease: 'sine.inOut', repeat: -1, yoyo: true });
    // 中心点脉冲
    gsap.to('.core-pulse', { attr: { r: 9 }, opacity: .4, duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true, transformOrigin: '300px 300px' });
  }

  function enterAdvisor() {
    buildAdvisorVisual();
    const scope = $('#page-advisor');
    gsap.fromTo('.advisor-visual', { autoAlpha: 0 }, { autoAlpha: 1, duration: 1, ease: 'power2.out' });
    gsap.fromTo('.greeting-eyebrow, .greeting-text', { y: 16, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: .7, stagger: .12, delay: .3, ease: 'power3.out' });
    state.qIdx = 0;
    state.answers = {};
    setTimeout(renderQuestion, 600);
  }

  function renderQuestion() {
    const Q = QUESTIONS[state.qIdx];
    $('#qnaStep').textContent = String(state.qIdx + 1).padStart(2, '0') + ' / 03';
    $$('.qna-dots .dot').forEach((d, i) => d.classList.toggle('is-on', i <= state.qIdx));
    gsap.to('#qnaQuestion', { autoAlpha: 0, y: -10, duration: .25, ease: 'power2.in',
      onComplete() {
        $('#qnaQuestion').textContent = Q.q;
        const opts = $('#qnaOptions');
        opts.innerHTML = '';
        Q.opts.forEach(o => {
          const b = document.createElement('button');
          b.className = 'qna-opt';
          b.textContent = o;
          b.addEventListener('click', () => selectAnswer(Q.key, o, b));
          opts.appendChild(b);
        });
        gsap.fromTo('#qnaQuestion', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .4, ease: 'power2.out' });
        gsap.fromTo('.qna-opt', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .4, stagger: .05, ease: 'power2.out' });
      } });
  }

  function selectAnswer(key, val, btn) {
    state.answers[key] = val;
    $$('.qna-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    gsap.to(btn, { scale: .94, duration: .12, yoyo: true, repeat: 1 });
    setTimeout(() => {
      state.qIdx++;
      if (state.qIdx < QUESTIONS.length) renderQuestion();
      else go('page-confirm');
    }, 480);
  }

  /* ============================================================
     ⑥ 确认选择页
     ============================================================ */
  function enterConfirm() {
    const scope = $('#page-confirm');
    const sum = $('#confirmSummary');
    const rows = [
      ['场合', state.answers.occasion || '都可以'],
      ['风格', state.answers.style || '都可以'],
      ['避雷', state.answers.avoid || '没有'],
    ];
    sum.innerHTML = rows.map(([k, v]) =>
      `<div class="summary-row"><span class="summary-key">${k}</span><span class="summary-val">${v}</span></div>`).join('');
    revealIn(scope, '.confirm-eyebrow, .confirm-title, .summary-row, .confirm-guide, .confirm-actions', { delay: .1 });
  }
  $('#confirmBack').addEventListener('click', () => { state.qIdx = 0; go('page-advisor'); });
  $('#confirmGo').addEventListener('click', () => go('page-generate'));

  /* ============================================================
     ⑧ 选品页面
     ============================================================ */
  async function renderShop() {
    const grid = $('#shopGrid');
    // 从后端拉当前 filter 下的商品；失败退回本地
    try {
      const r = await API.garments(state.filterStyle);
      if (Array.isArray(r.garments)) GARMENTS = mergeGarments(GARMENTS, r.garments);
    } catch (_) {}
    grid.innerHTML = '';
    const list = state.filterStyle === 'all' ? GARMENTS : GARMENTS.filter(g => g.style === state.filterStyle);
    list.forEach((g, i) => {
      const card = document.createElement('div');
      card.className = 'garment-card';
      if (state.picked.find(p => p.id === g.id)) card.classList.add('picked');
      if (state.picked.length >= 3 && !state.picked.find(p => p.id === g.id)) card.classList.add('disabled');
      card.innerHTML = `
        <div class="garment-img">
          ${g.image ? `<img src="${g.image}" alt="${g.title}" loading="lazy" />` : ''}
          <span class="garment-swatch" style="background:${g.swatch}"></span>
          <div class="garment-check"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 12l4 4 10-10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        </div>
        <div class="garment-info">
          <div class="garment-title">${g.title}</div>
          <div class="garment-tag">${g.tag}</div>
        </div>`;
      card.addEventListener('click', () => togglePick(g, card));
      grid.appendChild(card);
    });
    gsap.fromTo('.garment-card', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .5, stagger: .04, ease: 'power2.out' });
  }

  function mergeGarments(existing, incoming) {
    const map = new Map(existing.map(g => [g.id, g]));
    incoming.forEach(g => map.set(g.id, { ...map.get(g.id), ...g }));
    return Array.from(map.values());
  }

  function togglePick(g, card) {
    const idx = state.picked.findIndex(p => p.id === g.id);
    if (idx >= 0) {
      state.picked.splice(idx, 1);
    } else {
      if (state.picked.length >= 3) return;
      state.picked.push(g);
    }
    renderShop();
    updateShopBar();
  }

  function updateShopBar() {
    $('#shopCount').textContent = `已选 ${state.picked.length} / 3`;
    const picked = $('#shopPicked');
    if (!state.picked.length) {
      picked.innerHTML = '<span class="picked-empty">选定区 · 最多 3 件</span>';
    } else {
      picked.innerHTML = state.picked.map(g => `<div class="picked-chip" style="background:linear-gradient(160deg,${g.swatch},${g.swatch}cc)"></div>`).join('');
    }
    $('#shopConfirm').disabled = state.picked.length === 0;
  }

  function enterShop() {
    renderShop();
    updateShopBar();
    const scope = $('#page-shop');
    revealIn(scope, '.shop-title, .shop-count, .filter-group, .shop-suggest', { delay: .1 });
  }

  // 筛选
  $$('.filter-chips[data-filter="style"] .chip').forEach(c => c.addEventListener('click', () => {
    $$('.filter-chips[data-filter="style"] .chip').forEach(x => x.classList.remove('is-on'));
    c.classList.add('is-on');
    state.filterStyle = c.dataset.val;
    renderShop();
  }));
  $('#shopConfirm').addEventListener('click', () => {
    if (state.picked.length) go('page-shopconfirm');
  });

  // 反扫演示
  const scanFab = document.createElement('button');
  scanFab.className = 'scan-fab';
  scanFab.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M4 12h16" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  scanFab.title = '模拟反扫扫描';
  scanFab.addEventListener('click', async () => {
    if (state.picked.length >= 3) { showToast('已满 3 件，无法继续加入'); return; }
    let g = null;
    try {
      const r = await API.scan(state.picked.map(p => p.id));
      g = r.garment;
    } catch (_) {
      const pool = GARMENTS.filter(x => !state.picked.find(p => p.id === x.id));
      g = pool[Math.floor(Math.random() * pool.length)];
    }
    if (g) { state.picked.push(g); renderShop(); updateShopBar(); showToast('已识别实物 · 已加入选定区'); }
  });
  $('#page-shop').appendChild(scanFab);

  function showToast(msg) {
    const t = $('#scanToast');
    $('.scan-text', t).textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ============================================================
     ⑨ 确认穿搭方案
     ============================================================ */
  function enterShopConfirm() {
    const list = $('#scList');
    list.innerHTML = state.picked.map((g, i) => `
      <div class="sc-item">
        <div class="sc-item-img" style="background:linear-gradient(160deg,${g.swatch},${g.swatch}bb)"></div>
        <div class="sc-item-info"><h4>${g.title}</h4><p>${g.tag} · ${g.style}</p></div>
        <span class="sc-item-no">${String(i + 1).padStart(2, '0')}</span>
      </div>`).join('');
    revealIn($('#page-shopconfirm'), '.sc-eyebrow, .sc-title, .sc-item, .sc-actions', { delay: .1 });
  }
  $('#scBack').addEventListener('click', () => go('page-shop'));
  $('#scGo').addEventListener('click', () => go('page-generate'));

  /* ============================================================
     ⑦ 生成穿搭界面
     ============================================================ */
  function enterGenerate() {
    const scope = $('#page-generate');
    const bar = $('#genBar');
    const pct = $('#genPct');
    const label = $('#genLabel');
    const prog = { v: 0 };
    gsap.fromTo('.gen-orb', { scale: .8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .8, ease: 'power3.out' });
    gsap.to('.gr1', { rotation: 360, transformOrigin: '110px 110px', duration: 8, repeat: -1, ease: 'none' });
    gsap.to('.gr2', { rotation: -360, transformOrigin: '110px 110px', duration: 6, repeat: -1, ease: 'none' });
    gsap.to('.gr3', { rotation: 360, transformOrigin: '110px 110px', duration: 4, repeat: -1, ease: 'none' });

    const paint = () => {
      const v = Math.round(prog.v);
      bar.style.width = v + '%';
      pct.textContent = v + '%';
      label.textContent = GEN_MSGS[Math.min(GEN_MSGS.length - 1, Math.floor(v / 30))];
    };

    // 进度：慢速渐进到 85%（80s 兜底），backend 完成即立刻冲到 100%
    const slowTween = gsap.to(prog, {
      v: 85, duration: 80, ease: 'power1.out',
      onUpdate: paint,
    });

    // 分支决定后端端点：advisor → 真图（Demo：始终用 data/people/ 里的固定人像，忽略拍到的图）
    const backendReady = (state.branch === 'advisor'
      ? API.advisorGenerate(state.sessionId)
      : API.outfitGenerate(state.sessionId, {
          answers: state.answers,
          pickedIds: state.picked.map(p => p.id),
        })
    ).then(r => {
      if (r && Array.isArray(r.outfits) && r.outfits.length) RESULTS = r.outfits;
      return r;
    }).catch(() => null);

    backendReady.finally(() => {
      slowTween.kill();
      gsap.to(prog, {
        v: 100, duration: .6, ease: 'power2.out',
        onUpdate: paint,
        onComplete() { go('page-result'); },
      });
    });
  }

  /* ============================================================
     ⑩ 生成结果页
     ============================================================ */
  function renderResultCards() {
    const wrap = $('#resultCards');
    wrap.innerHTML = RESULTS.map((r, i) => {
      const figure = r.imageUrl
        ? `<div class="result-figure has-img"><img class="result-img" src="${r.imageUrl}" alt="${r.title || ''}" loading="lazy"><div class="result-figure-glow"></div></div>`
        : `<div class="result-figure" style="background:linear-gradient(165deg, ${r.color1 || '#E7D4C5'}, ${r.color2 || '#C9A88A'})"><div class="result-figure-glow"></div></div>`;
      return `
      <div class="result-card" data-i="${i}">
        ${figure}
        <div class="result-meta">
          <div class="result-card-tag">LOOK ${String(i + 1).padStart(2, '0')}</div>
          <div class="result-card-title">${r.title || ''}</div>
          <div class="result-card-style">${r.style || ''}</div>
        </div>
      </div>`;
    }).join('');
    $('#resultIndicator').innerHTML = RESULTS.map((_, i) => `<span class="ind-dot${i === 0 ? ' is-on' : ''}"></span>`).join('');
  }

  function enterResult() {
    renderResultCards();
    state.resultIdx = 0;
    const scope = $('#page-result');
    gsap.fromTo('.result-home', { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: .5, delay: .3 });
    gsap.fromTo('.result-card', { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .7, delay: .2, ease: 'power3.out' });
    gsap.fromTo('.result-actions', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .6, delay: .6 });
    // 触摸/点击切换
    const stage = $('#resultStage');
    stage.onclick = null;
    stage.addEventListener('click', switchResult);
    // 自动倒计时
    startCountdown();
  }

  function switchResult() {
    state.resultIdx = (state.resultIdx + 1) % RESULTS.length;
    gsap.to('#resultCards', { x: `-${state.resultIdx * 100}%`, duration: .6, ease: 'power3.inOut' });
    $$('.ind-dot').forEach((d, i) => d.classList.toggle('is-on', i === state.resultIdx));
    resetCountdown();
  }

  function startCountdown() {
    let left = 30;
    const el = $('#resultCountdown');
    el.textContent = `${left}s 后自动返回首页`;
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(() => {
      left--;
      el.textContent = `${left}s 后自动返回首页`;
      if (left <= 0) { clearInterval(state.countdownTimer); goHome(); }
    }, 1000);
  }
  function resetCountdown() { startCountdown(); }

  function goHome() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    // 重置状态
    state.answers = {}; state.qIdx = 0; state.picked = []; state.filterStyle = 'all';
    state.reportSegments = null; state.shareUrl = null; state.branch = null;
    state.capturedImage = null;
    // 换新会话，保证每个 walk-in 客人独立
    API.createSession().then(s => { if (s && s.sessionId) state.sessionId = s.sessionId; }).catch(() => {});
    $$('.filter-chips[data-filter="style"] .chip').forEach((x, i) => x.classList.toggle('is-on', i === 0));
    go('page-capture');
  }
  $('#resultHome').addEventListener('click', goHome);

  // 二维码弹窗
  $('#resultSave').addEventListener('click', async () => {
    const modal = $('#qrModal');
    modal.classList.add('show');
    drawQR();
    gsap.fromTo('.qr-card', { y: 24, autoAlpha: 0, scale: .96 }, { y: 0, autoAlpha: 1, scale: 1, duration: .5, ease: 'power3.out' });
    resetCountdown();
    // 后端：拿到真实短链（当前视觉仍为装饰性二维码，URL 存 state.shareUrl 供后续接入）
    try {
      const r = await API.saveLook(state.sessionId, RESULTS.map(x => x.id).filter(Boolean));
      state.shareUrl = r.shareUrl;
      const tip = $('.qr-tip');
      if (tip && r.shareUrl) tip.textContent = `扫码或访问 ${new URL(r.shareUrl).pathname} 保存至相册`;
    } catch (_) {}
  });
  $('#qrClose').addEventListener('click', () => {
    gsap.to('.qr-card', { y: 16, autoAlpha: 0, duration: .3, onComplete() { $('#qrModal').classList.remove('show'); } });
  });

  // 绘制装饰性二维码
  function drawQR() {
    const svg = $('#qrSvg');
    svg.innerHTML = '';
    const N = 23, cell = 6, total = N * cell;
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    const isFinder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
    // 三个定位角
    [[0, 0], [N - 7, 0], [0, N - 7]].forEach(([fx, fy]) => {
      const outer = document.createElementNS(SVGNS, 'rect');
      outer.setAttribute('x', fx * cell); outer.setAttribute('y', fy * cell);
      outer.setAttribute('width', 7 * cell); outer.setAttribute('height', 7 * cell); outer.setAttribute('rx', 4);
      svg.appendChild(outer);
      const inner = document.createElementNS(SVGNS, 'rect');
      inner.setAttribute('x', (fx + 1) * cell); inner.setAttribute('y', (fy + 1) * cell);
      inner.setAttribute('width', 5 * cell); inner.setAttribute('height', 5 * cell);
      inner.setAttribute('fill', '#2A231F'); inner.setAttribute('rx', 3);
      svg.appendChild(inner);
      const dot = document.createElementNS(SVGNS, 'rect');
      dot.setAttribute('x', (fx + 2) * cell); dot.setAttribute('y', (fy + 2) * cell);
      dot.setAttribute('width', 3 * cell); dot.setAttribute('height', 3 * cell); dot.setAttribute('rx', 2);
      svg.appendChild(dot);
    });
    // 随机模块
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (isFinder(x, y)) continue;
        if (Math.random() < 0.46) {
          const r = document.createElementNS(SVGNS, 'rect');
          r.setAttribute('x', x * cell); r.setAttribute('y', y * cell);
          r.setAttribute('width', cell); r.setAttribute('height', cell);
          svg.appendChild(r);
        }
      }
    }
  }

  /* ============================================================
     初始化
     ============================================================ */
  async function prefetch() {
    // 并行：开会话 + 拉题库 + 预热商品；失败均忽略（有本地兜底）
    const [sess, qs, gs] = await Promise.all([
      API.createSession().catch(() => null),
      API.questions().catch(() => null),
      API.garments('all').catch(() => null),
    ]);
    if (sess && sess.sessionId) state.sessionId = sess.sessionId;
    if (qs && Array.isArray(qs.questions) && qs.questions.length) QUESTIONS = qs.questions;
    if (gs && Array.isArray(gs.garments) && gs.garments.length) GARMENTS = gs.garments;
  }

  function init() {
    $('#brandMeta').textContent = STEPS['page-capture'];
    enterCapture();
    // 镜像人像呼吸
    gsap.to('.mirror-silhouette', { y: -4, duration: 4, ease: 'sine.inOut', repeat: -1, yoyo: true });
    gsap.to('.mirror-glow', { opacity: .8, duration: 5, ease: 'sine.inOut', repeat: -1, yoyo: true });
    prefetch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
