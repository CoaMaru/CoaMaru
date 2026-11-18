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
      <p>こあまる家にログインしてね</p>
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
    'auth/invalid-email':'メールアドレスの形がちがうみたい',
    'auth/user-not-found':'そのメールアドレスは登録されてないよ',
    'auth/wrong-password':'パスワードがちがうよ',
    'auth/invalid-credential':'メールアドレスかパスワードがちがうよ',
    'auth/invalid-login-credentials':'メールアドレスかパスワードがちがうよ',
    'auth/email-already-in-use':'そのメールアドレスはもう登録されてるよ。ログインしてね',
    'auth/weak-password':'パスワードは6文字以上にしてね',
    'auth/network-request-failed':'ネットにつながってないみたい',
    'auth/too-many-requests':'何回も失敗したので少し待ってね'
  };
  const errText = e => MSG[e && e.code] || ('うまくいかなかった（' + (e && e.code || '不明') + '）');

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
        if (!mail()) { err('先にメールアドレスを入れてね'); return; }
        auth.sendPasswordResetEmail(mail()).then(() => err('リセット用のメールを送ったよ')).catch(e => err(errText(e)));
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

  window.claude = {
    use: async name => {
      if (name === 'db') {
        const db = await init();
        if (!db) throw Object.assign(new Error('no db'), { code: 'not_configured' });
        return db;
      }
      // レシート読み取り（Claude専用機能）はアプリ版では使えない
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
        <button id="kmImport">データを取り込む</button>
        <button id="kmLogout">ログアウト</button>
      </div>
      <input type="file" id="kmFile" accept="application/json,.json" style="display:none">
      <div class="muted" id="kmMsg" style="margin-top:8px"></div>`;
    set.appendChild(c);
    const msg = t => document.getElementById('kmMsg').textContent = t;
    try { const u = firebase.auth().currentUser; if (u) document.getElementById('kmWho').textContent = 'ログイン中：' + u.email; } catch(e) {}
    document.getElementById('kmLogout').onclick = () => { if (confirm('ログアウトする？')) firebase.auth().signOut(); };
    document.getElementById('kmImport').onclick = () => document.getElementById('kmFile').click();
    document.getElementById('kmFile').onchange = async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!confirm('今のデータを、このファイルの内容で上書きして取り込む？')) return;
        const db = await init(); const fs = db._fs;
        msg('取り込み中…');
        const batch = fs.batch();
        if (data.settings) batch.set(fs.doc(HOUSE + '/settings/main'), data.settings);
        (data.expenses || []).forEach(x => batch.set(fs.doc(HOUSE + '/expenses/' + x.id), x.data));
        (data.moves || []).forEach(x => batch.set(fs.doc(HOUSE + '/moves/' + x.id), x.data));
        await batch.commit();
        msg('取り込み完了！ 記録 ' + (data.expenses || []).length + '件');
      } catch (err) { msg('取り込めなかった：' + (err && (err.code || err.message) || '')); }
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    init().then(addTools);
    if (!CFG || !CFG.apiKey) {
      const s = document.getElementById('status'); if (s) s.textContent = 'Firebaseの設定がまだだよ';
    }
  });
})();
