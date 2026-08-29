/* 成书交互：阅读进度、滚动渐入、目录跟随、引用块逐段步进、图表绘制动画。
   全部原生实现，除 mermaid 外无外部依赖。 */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 深浅色，记住选择 ───────────────────── */
  var KEY = 'book-theme';
  var saved = localStorage.getItem(KEY);
  if (saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }
  var themeBtn = document.querySelector('.theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var dark = document.body.classList.toggle('dark');
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    });
  }

  /* ── 阅读进度 ───────────────────────────── */
  var bar = document.querySelector('.progress i');
  if (bar) {
    var tick = function () {
      var h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? Math.min(1, scrollY / h) * 100 : 0) + '%';
    };
    addEventListener('scroll', tick, { passive: true });
    addEventListener('resize', tick);
    tick();
  }

  /* ── 正文分块渐入 ───────────────────────── */
  var main = document.querySelector('.chapter, .colophon');
  if (main && !reduce) {
    var targets = main.querySelectorAll(
      'p, h2, h3, h4, ul, ol, figure, table, blockquote, .ch-meta, .ch-nav');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
    targets.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  }
  document.querySelectorAll('.cover .reveal').forEach(function (el) {
    if (reduce) { el.classList.add('in'); return; }
    new IntersectionObserver(function (es, ob) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        ob.disconnect();
      });
    }, { threshold: 0.05 }).observe(el);
  });

  /* ── 封面数字滚动 ───────────────────────── */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var end = parseFloat(el.dataset.count) || 0;
    var dec = (el.dataset.count.split('.')[1] || '').length;
    if (reduce) { el.textContent = end.toFixed(dec); return; }
    var t0 = null, dur = 900;
    var run = function (t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      el.textContent = (end * (1 - Math.pow(1 - k, 3))).toFixed(dec);
      if (k < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  });

  /* ── 侧栏目录跟随 ───────────────────────── */
  var links = [].slice.call(document.querySelectorAll('.side a'));
  if (links.length) {
    var heads = links.map(function (a) {
      return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    });
    var sync = function () {
      var best = 0;
      heads.forEach(function (h, i) {
        if (h && h.getBoundingClientRect().top <= 120) best = i;
      });
      links.forEach(function (a, i) { a.classList.toggle('on', i === best); });
    };
    addEventListener('scroll', sync, { passive: true });
    sync();
  }

  /* ── 复制 ───────────────────────────────── */
  document.querySelectorAll('.cite-btn.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fig = btn.closest('figure');
      var code = fig.querySelector('code');
      var text = fig.classList.contains('cite')
        ? [].map.call(code.querySelectorAll('.lt'), function (s) { return s.textContent; }).join('\n')
        : code.textContent;
      navigator.clipboard.writeText(text).then(function () {
        var old = btn.textContent;
        btn.textContent = '已复制';
        setTimeout(function () { btn.textContent = old; }, 1400);
      });
    });
  });

  /* ── 引用块逐段步进 ─────────────────────────
     带省略标记的引用块中间是断开的。按段依次高亮，让读者看清
     哪几行在源文件里真的连在一起，省略处不会被当成连续代码。 */
  document.querySelectorAll('figure.cite[data-steppable]').forEach(function (fig) {
    var btn = fig.querySelector('.cite-btn.step');
    if (!btn) return;
    var lines = [].slice.call(fig.querySelectorAll('.cl'));
    var segs = [];
    lines.forEach(function (l) {
      var s = l.dataset.seg;
      if (segs.indexOf(s) < 0 && !l.classList.contains('gap')) segs.push(s);
    });
    var at = -1, timer = null;

    var paint = function () {
      lines.forEach(function (l) {
        l.classList.toggle('hot', at >= 0 && l.dataset.seg === segs[at]);
      });
    };
    var stop = function () {
      clearInterval(timer); timer = null; at = -1;
      fig.classList.remove('stepping');
      btn.classList.remove('on');
      btn.textContent = '逐段';
      lines.forEach(function (l) { l.classList.remove('hot'); });
    };

    btn.addEventListener('click', function () {
      if (timer) { stop(); return; }
      fig.classList.add('stepping');
      btn.classList.add('on');
      at = 0; paint();
      btn.textContent = '第 1 / ' + segs.length + ' 段';
      timer = setInterval(function () {
        at += 1;
        if (at >= segs.length) { stop(); return; }
        paint();
        btn.textContent = '第 ' + (at + 1) + ' / ' + segs.length + ' 段';
      }, 1500);
    });
  });

  /* ── 图表：进视野再渲染，配绘制动画 ─────── */
  function initDiagrams() {
    var mermaid = window.__mermaid;
    if (!mermaid) return;
    var figs = [].slice.call(document.querySelectorAll('figure.diagram'));
    if (!figs.length) return;
    var draw = function (fig) {
      var box = fig.querySelector('.mermaid');
      if (!box || box.dataset.done) return;
      box.dataset.done = '1';
      mermaid.run({ nodes: [box] }).then(function () {
        if (!reduce) {
          fig.classList.add('drawing');
          setTimeout(function () { fig.classList.remove('drawing'); }, 1600);
        }
      }).catch(function (err) {
        box.innerHTML = '<p style="color:var(--faint);font-size:13px">图渲染失败：'
          + String(err && err.message || err) + '</p>';
      });
    };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        draw(e.target); io.unobserve(e.target);
      });
    }, { rootMargin: '200px 0px' });
    figs.forEach(function (f) { io.observe(f); });
  }
  document.addEventListener('mermaid-ready', initDiagrams);
  if (window.__mermaid) initDiagrams();

  /* ── 左右方向键翻章 ─────────────────────── */
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var sel = e.key === 'ArrowLeft' ? '.ch-nav .prev' : e.key === 'ArrowRight' ? '.ch-nav .next' : null;
    var a = sel && document.querySelector(sel);
    if (a) location.href = a.getAttribute('href');
  });
})();
