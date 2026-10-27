/* SAQIIB BOT — pairing flow */
(function () {
  'use strict';

  // ---- backend resolution: ?backend=... > localStorage > config.js ----
  var qs = new URLSearchParams(location.search);
  var BACKEND = (qs.get('backend') || localStorage.getItem('saqiib_backend') ||
                 window.SAQIIB_BACKEND || '').replace(/\/+$/, '');
  if (qs.get('backend')) localStorage.setItem('saqiib_backend', BACKEND);

  var $ = function (id) { return document.getElementById(id); };
  var ccEl = $('cc'), numEl = $('num'), goEl = $('go'), againEl = $('again');
  var codeBox = $('codeBox'), codeEl = $('code'), hintEl = $('hint'),
      timerEl = $('timer'), stepsEl = $('steps'), statusEl = $('status'), pingEl = $('ping');

  var pollTimer = null, tickTimer = null, expiresAt = 0, currentNumber = null;

  // ---------------- helpers ----------------
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function fullNumber() {
    var cc = digits(ccEl.value);
    var n = digits(numEl.value);
    n = n.replace(/^0+/, '');            // drop local trunk zero
    if (n.indexOf(cc) === 0 && n.length > cc.length + 6) return n; // already has cc
    return cc + n;
  }

  function setStatus(kind, text, spinning) {
    statusEl.className = 'status show ' + kind;
    statusEl.innerHTML = (spinning ? '<span class="spin"></span>' : '') +
      '<span>' + text + '</span>';
  }

  function clearStatus() {
    statusEl.className = 'status';
    statusEl.innerHTML = '';
  }

  function stopTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function fmt(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function api(path, opts) {
    return fetch(BACKEND + path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, opts || {})).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { status: r.status, body: j };
      });
    });
  }

  // ---------------- backend ping ----------------
  function ping() {
    if (!BACKEND) { pingEl.textContent = 'not configured'; return; }
    api('/health').then(function (r) {
      if (r.body && r.body.ok) {
        pingEl.textContent = r.body.connected ? 'online • connected' : 'online • ready';
        pingEl.style.color = '#00a884';
      } else {
        pingEl.textContent = 'unreachable';
        pingEl.style.color = '#f15c6d';
      }
    }).catch(function () {
      pingEl.textContent = 'unreachable';
      pingEl.style.color = '#f15c6d';
    });
  }

  // ---------------- show code ----------------
  function showCode(code, expiresIn) {
    codeEl.textContent = code;
    codeBox.classList.add('show');
    stepsEl.classList.add('show');
    againEl.style.display = 'block';
    expiresAt = Date.now() + (Number(expiresIn) > 0 ? Number(expiresIn) * 1000 : 120000);

    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      var left = (expiresAt - Date.now()) / 1000;
      if (left <= 0) {
        timerEl.textContent = '⏱ Code expire ho gaya — "Naya code lein" dabayen';
        timerEl.style.color = '#f15c6d';
        clearInterval(tickTimer); tickTimer = null;
      } else {
        timerEl.textContent = '⏱ Valid: ' + fmt(left);
        timerEl.style.color = left < 30 ? '#f15c6d' : '#f0b429';
      }
    }, 1000);
  }

  // ---------------- poll connection ----------------
  function startPolling(number) {
    currentNumber = number;
    if (pollTimer) clearInterval(pollTimer);

    pollTimer = setInterval(function () {
      api('/api/pair/state?number=' + encodeURIComponent(number)).then(function (r) {
        var s = r.body || {};
        if (s.connected) {
          stopTimers();
          codeBox.classList.remove('show');
          stepsEl.classList.remove('show');
          againEl.style.display = 'none';
          setStatus('ok', '✅ Device link ho gaya! Ab WhatsApp mein <b>.menu</b> bhejein.');
          return;
        }
        if (s.status === 'pairing' || s.status === 'connecting') {
          setStatus('info', 'Code ka intezaar… WhatsApp mein code daalein.', true);
        } else if (s.status === 'unpaired' || s.status === 'idle') {
          setStatus('warn', 'Session ready nahi — dobara code lein.');
        }
      }).catch(function () { /* transient network error, keep polling */ });
    }, 3000);
  }

  // ---------------- main action ----------------
  function requestCode() {
    var n = fullNumber();
    if (n.length < 8) {
      setStatus('error', 'Number sahi nahi hai — poora number likhein.');
      numEl.focus();
      return;
    }
    if (!BACKEND) {
      setStatus('error', 'Backend set nahi hai (config.js).');
      return;
    }

    goEl.disabled = true;
    goEl.textContent = 'Code ban raha hai…';
    clearStatus();
    setStatus('info', 'WhatsApp se code maang rahe hain…', true);
    stopTimers();

    api('/api/pair', { method: 'POST', body: JSON.stringify({ number: n }) })
      .then(function (r) {
        var b = r.body || {};
        if (b.code) {
          showCode(b.code, b.expiresIn);
          setStatus('info', 'Code tayyar hai — neeche steps follow karein.', false);
          startPolling(b.number || n);
          return;
        }
        if (b.alreadyLinked || b.status === 'connected') {
          codeBox.classList.remove('show');
          stepsEl.classList.remove('show');
          setStatus('ok', '✅ Yeh number pehle se linked hai. WhatsApp mein <b>.menu</b> bhejein.');
          return;
        }
        setStatus('error', (b.error || 'Code nahi mila') + ' — dobara koshish karein.');
      })
      .catch(function (e) {
        setStatus('error', 'Backend se connect nahi hua. Bot online hai? (' + (e.message || 'network') + ')');
      })
      .finally(function () {
        goEl.disabled = false;
        goEl.textContent = 'Get Pairing Code';
      });
  }

  // ---------------- events ----------------
  goEl.addEventListener('click', requestCode);
  againEl.addEventListener('click', requestCode);
  numEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') requestCode();
  });
  numEl.addEventListener('input', function () {
    numEl.value = numEl.value.replace(/[^\d\s-]/g, '');
  });

  codeEl.addEventListener('click', function () {
    var t = codeEl.textContent.trim();
    if (!t || t.indexOf('·') === 0) return;
    var plain = t.replace(/[^A-Za-z0-9]/g, '');
    navigator.clipboard.writeText(plain).then(function () {
      hintEl.textContent = '✅ Copied!';
      setTimeout(function () { hintEl.textContent = 'Tap code to copy'; }, 1600);
    }).catch(function () {
      hintEl.textContent = 'Copy nahi hua — code manually likhein';
    });
  });

  // prefill from ?number=
  if (qs.get('number')) {
    var raw = digits(qs.get('number'));
    if (raw) numEl.value = raw;
  }

  ping();
  setInterval(ping, 20000);
})();
