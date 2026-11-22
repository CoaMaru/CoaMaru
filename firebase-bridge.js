// こあまる家：Firebase とつなぐ部分（ログイン・2人で同期・データ取り込み）
(function(){
  const CFG = window.KOAMARU_FIREBASE;
  const HOUSE = 'households/koamaru';
  let fsReady = null;

  const css = `
  #authGate{position:fixed;inset:0;z-index:200;display:none;align-items:center;justify-content:center;padding:24px;
    background:radial-gradient(circle at 50% 30%,#1e1340,#0b0716 70%)}
  #authGate.on{display:flex}
  #authGate .box{width:100%;max-width:360px;background:rgba(24,16,44,.85);border:1px solid rgba(190,155,255,.35);border-radius:20px;padding:24px;
    box-shadow:0 0 40px rgba(190,155,255,.2);color:#e6f1ff;font-family:"Noto Sans JP",sans-serif;text-align:center}
  #authGate img{width:84px;height:84px;border-radius:18px;box-shadow:0 0 18px rgba(198,168,255,.45)}
  #authGate h1{font-family:"Orbitron",sans-serif;letter-spacing:.2em;font-size:18px;margin:14px 0 4px}
  #authGate p{font-size:12px;color:#9f93bf;margin:0 0 16px}
  #authGate input{width:100%;margin:6px 0;padding:12px;border-radius:10px;border:1px solid rgba(190,155,255,.3);background:rgba(11,7,22,.7);color:#fff;font-size:16px}
  #authGate button{width:100%;margin-top:10px;padding:12px;border-radius:10px;border:1px solid rgba(198,168,255,.6);
    background:linear-gradient(90deg,rgba(155,123,255,.35),rgba(198,168,255,.25));color:#fff;font-weight:800;font-size:15px;letter-spacing:.08em}
  #authGate button.sub{background:none;border:none;color:#c6a8ff;font-size:12px;font-weight:600;margin-top:6px}
  #authGate .err{color:#ff5577;font-size:12px;min-height:18px;margin-top:8px}
  .kmTools{display:flex;gap:8px;flex-wrap:wrap}
  .kmTools button{flex:1;min-width:130px;padding:10px;border-radius:10px;border:1px solid rgba(190,155,255,.35);background:rgba(190,155,255,.08);color:#c6a8ff;font-weight:700;font-size:12px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function gate(){
    let g = document.getElementById('authGate');
    if (g) return g;
    g = document.createElement('div'); g.id = 'authGate';
    g.innerHTML = `<div class="box">
      <img src="logo.png" alt="">
      <h1>COAMARU</h1>
      <p>こあまる家にログイン</p>
      <input id="agMail" type="email" placeholder="メールアドレス" autocomplete="email">
      <input id="agPass" type="password" placeholder="パスワード（6文字以上）" autocomplete="current-password">
      <button id="agLogin">ログイン</button>
      <button id="agSignup" class="sub">はじめて使う人はこちら（アカウント作成）</button>
      <button id="agReset" class="sub">パスワードを忘れた</button>
      <div class="err" id="agErr"></div></div>`;
    document.body.appendChild(g);
    return g;
  }
  const MSG = {
    'auth/invalid-email':'メールアドレスの形式が正しくありません',
    'auth/user-not-found':'このメールアドレスは登録されていません',
    'auth/wrong-password':'パスワードが違います',
    'auth/invalid-credential':'メールアドレスまたはパスワードが違います',
    'auth/invalid-login-credentials':'メールアドレスまたはパスワードが違います',
    'auth/email-already-in-use':'このメールアドレスは登録済みです。ログインしてください',
    'auth/weak-password':'パスワードは6文字以上で入力してください',
    'auth/network-request-failed':'ネットワークに接続されていません',
    'auth/too-many-requests':'試行回数が多すぎます。しばらくしてからお試しください'
  };
  const errText = e => MSG[e && e.code] || ('エラーが発生しました（' + (e && e.code || '不明') + '）');

  function init(){
    if (fsReady) return fsReady;
    fsReady = new Promise(resolve => {
      if (!CFG || !CFG.apiKey || !window.firebase) { resolve(null); return; }
      firebase.initializeApp(CFG);
      const fs = firebase.firestore();
      try { fs.enablePersistence({ synchronizeTabs: true }).catch(()=>{}); } catch(e) {}
      const auth = firebase.auth();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
      let done = false;
      auth.onAuthStateChanged(u => {
        const g = gate();
        if (u) {
          g.classList.remove('on');
          if (!done) { done = true; resolve(wrap(fs)); }
        } else {
          g.classList.add('on');
          if (done) location.reload();
        }
      });
      const g = gate();
      const mail = () => g.querySelector('#agMail').value.trim();
      const pass = () => g.querySelector('#agPass').value;
      const err = t => g.querySelector('#agErr').textContent = t;
      g.querySelector('#agLogin').onclick = () => { err(''); auth.signInWithEmailAndPassword(mail(), pass()).catch(e => err(errText(e))); };
      g.querySelector('#agSignup').onclick = () => { err(''); auth.createUserWithEmailAndPassword(mail(), pass()).catch(e => err(errText(e))); };
      g.querySelector('#agReset').onclick = () => {
        if (!mail()) { err('メールアドレスを入力してください'); return; }
        auth.sendPasswordResetEmail(mail()).then(() => err('メールを送信しました')).catch(e => err(errText(e)));
      };
    });
    return fsReady;
  }

  // 今までの家計簿と同じ書き方で使えるように、2人の共有スペースに向ける
  function wrap(fs){
    return {
      doc: p => fs.doc(HOUSE + '/' + p),
      collection: p => fs.collection(HOUSE + '/' + p),
      _fs: fs
    };
  }


  // レシート読み取り：Firebase AI Logic（Gemini）で写真を読む
  const AI_MODEL = 'gemini-4-hydrogen';
  function shrink(file){
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        // 長いレシートでも文字がつぶれないよう、画素数で縮める（最大約400万画素・長い辺3072px）
        const k = Math.min(1, Math.sqrt(4000000 / (img.width * img.height)), 3072 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.9).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(Object.assign(new Error('bad image'), { code: 'image_rejected' })); };
      img.src = url;
    });
  }
  function receiptReader(){
    const { getAI, getGenerativeModel, GoogleAIBackend } = window.fbAI;
    const app = firebase.app()._delegate || firebase.app();
    const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
      model: AI_MODEL, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    });
    return {
      limits: async () => ({ images: true }),
      json: async (prompt, opt) => {
        opt = opt || {};
        const parts = [prompt];
        for (const f of (opt.images || [])) parts.push({ inlineData: { data: await shrink(f), mimeType: 'image/jpeg' } });
        if (opt.signal && opt.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        let r;
        try { r = await model.generateContent(parts); }
        catch (e) {
          const m = String(e && (e.message || e.code) || '');
          if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) throw Object.assign(new Error(m), { code: 'quota' });
          if (/503|overloaded|UNAVAILABLE/i.test(m)) throw Object.assign(new Error(m), { code: 'rate_limited' });
          if (/api-not-enabled|SERVICE_DISABLED|has not been used|not been enabled|firebasevertexai/i.test(m)) throw Object.assign(new Error(m), { code: 'not_enabled' });
          if (/404|not found|is not supported/i.test(m)) throw Object.assign(new Error(m), { code: 'no_model' });
          if (/403|PERMISSION_DENIED|API_KEY|api key|referer|app-check|appcheck/i.test(m)) throw Object.assign(new Error(m), { code: 'denied' });
          if (/SAFETY|blocked/i.test(m)) throw Object.assign(new Error(m), { code: 'image_rejected' });
          throw e;
        }
        const t = r.response.text().trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
        try { return JSON.parse(t); } catch (e) { const i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (_) {} } throw Object.assign(new Error('json: ' + t.slice(0, 120)), { code: 'invalid_json' }); }
      }
    };
  }

  // SoNaとの会話：Gemini（Firebase AI Logic）で、こあまる家の画面からそのまま使えるようにする
  const errOf = e => {
    const m = String(e && (e.message || e.code) || '');
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) return Object.assign(new Error(m), { code: 'rate_limited' });
    if (/503|overloaded|UNAVAILABLE/i.test(m)) return Object.assign(new Error(m), { code: 'rate_limited' });
    if (/api-not-enabled|SERVICE_DISABLED|not been enabled|403|PERMISSION_DENIED/i.test(m)) return Object.assign(new Error(m), { code: 'not_granted' });
    return e;
  };
  // JSON Schema を Gemini の形に（使えないキーは外す）
  const toSchema = sc => {
    if (!sc || typeof sc !== 'object') return sc;
    const o = {};
    for (const k of ['type', 'description', 'enum', 'items', 'properties', 'required', 'format', 'nullable']) if (sc[k] !== undefined) o[k] = sc[k];
    if (o.properties) { const p = {}; for (const k in o.properties) p[k] = toSchema(o.properties[k]); o.properties = p; }
    if (o.items) o.items = toSchema(o.items);
    return o;
  };
  function sampler(){
    const reader = receiptReader();
    const { getAI, getGenerativeModel, GoogleAIBackend } = window.fbAI;
    const app = firebase.app()._delegate || firebase.app();
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const fn = async (input, opt) => {
      opt = opt || {};
      const msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : (input || []);
      const tools = opt.tools || [];
      const model = getGenerativeModel(ai, {
        model: AI_MODEL, generationConfig: { temperature: 0.6 },
        tools: tools.length ? [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description || '', parameters: toSchema(t.inputSchema || { type: 'object', properties: {} }) })) }] : undefined
      });
      const contents = msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }));
      for (let turn = 0; turn < 4; turn++) {
        if (opt.signal && opt.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        let r;
        try { r = await model.generateContent({ contents }); } catch (e) { throw errOf(e); }
        const res = r.response;
        const calls = (res.functionCalls && res.functionCalls()) || [];
        if (calls.length && tools.length) {
          contents.push({ role: 'model', parts: calls.map(c => ({ functionCall: { name: c.name, args: c.args || {} } })) });
          const parts = [];
          for (const c of calls) {
            const t = tools.find(x => x.name === c.name);
            let out;
            try { out = t ? await t.execute(c.args || {}) : { error: 'unknown tool' }; } catch (e) { out = { error: String(e && e.message || e) }; }
            parts.push({ functionResponse: { name: c.name, response: { result: out } } });
          }
          contents.push({ role: 'function', parts });
          continue;
        }
        let text = '';
        try { text = res.text(); } catch (e) { text = ''; }
        if (opt.onText) try { opt.onText({ text, delta: text }); } catch (_) {}
        return { text, truncated: false };
      }
      return { text: 'ごめんね、うまく答えられなかった。もう一度聞いてみて。', truncated: false };
    };
    fn.json = reader.json;
    fn.limits = reader.limits;
    return fn;
  }

  window.claude = {
    use: async name => {
      if (name === 'db') {
        const db = await init();
        if (!db) throw Object.assign(new Error('no db'), { code: 'not_configured' });
        return db;
      }
      if (name === 'sample') {
        const db = await init();
        if (!db || !window.fbAI) throw Object.assign(new Error('no ai'), { code: 'not_granted' });
        return sampler();
      }
      throw Object.assign(new Error('unavailable'), { code: 'not_granted' });
    }
  };

  // 設定タブに「データ取り込み」「ログアウト」を追加
  function addTools(){
    const set = document.getElementById('tab-set');
    if (!set || document.getElementById('kmTools')) return;
    const c = document.createElement('div'); c.className = 'card'; c.id = 'kmTools';
    c.innerHTML = `<h2><span class="t">アプリ</span></h2>
      <div class="muted" id="kmWho" style="margin-bottom:10px"></div>
      <div class="kmTools">
        <button id="kmExport">データを書き出す</button>
        <button id="kmImport">データを取り込む</button>
        <button id="kmLogout">ログアウト</button>
      </div>
      <input type="file" id="kmFile" accept="application/json,.json" style="display:none">
      <div class="muted" id="kmMsg" style="margin-top:8px"></div>`;
    set.appendChild(c);
    const msg = t => document.getElementById('kmMsg').textContent = t;
    try { const u = firebase.auth().currentUser; if (u) document.getElementById('kmWho').textContent = 'ログイン中：' + u.email; } catch(e) {}
    document.getElementById('kmLogout').onclick = () => { if (confirm('ログアウトしますか？')) firebase.auth().signOut(); };
    // 書き出し：取り込みと同じ形のJSONファイルにする
    document.getElementById('kmExport').onclick = async () => {
      try {
        msg('書き出し中…');
        const db = await init(); const fs = db._fs;
        const [s, ex, mv] = await Promise.all([
          fs.doc(HOUSE + '/settings/main').get(),
          fs.collection(HOUSE + '/expenses').get(),
          fs.collection(HOUSE + '/moves').get()
        ]);
        const data = {
          app: 'coamaru', exportedAt: new Date().toISOString(),
          settings: s.exists ? s.data() : null,
          expenses: ex.docs.map(d => ({ id: d.id, data: d.data() })),
          moves: mv.docs.map(d => ({ id: d.id, data: d.data() }))
        };
        const d = new Date(), z = n => String(n).padStart(2, '0');
        const name = `coamaru-backup-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const file = new File([blob], name, { type: 'application/json' });
        // スマホは共有メニュー（ファイルに保存・LINEなど）、PCはダウンロード
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'こあまる家のデータ' }); msg('書き出しました'); return; }
          catch (e) { if (e && e.name === 'AbortError') { msg(''); return; } }
        }
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        msg('書き出しました');
      } catch (err) { msg('書き出せませんでした：' + (err && (err.code || err.message) || '')); }
    };
    document.getElementById('kmImport').onclick = () => document.getElementById('kmFile').click();
    document.getElementById('kmFile').onchange = async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!confirm('現在のデータを上書きして取り込みますか？')) return;
        const db = await init(); const fs = db._fs;
        msg('取り込み中…');
        const batch = fs.batch();
        if (data.settings) batch.set(fs.doc(HOUSE + '/settings/main'), data.settings);
        (data.expenses || []).forEach(x => batch.set(fs.doc(HOUSE + '/expenses/' + x.id), x.data));
        (data.moves || []).forEach(x => batch.set(fs.doc(HOUSE + '/moves/' + x.id), x.data));
        await batch.commit();
        msg('取り込みました');
      } catch (err) { msg('取り込めませんでした：' + (err && (err.code || err.message) || '')); }
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    init().then(addTools);
    if (!CFG || !CFG.apiKey) {
      const s = document.getElementById('status'); if (s) s.textContent = 'Firebaseが設定されていません';
    }
  });
})();
