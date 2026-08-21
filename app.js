/* Utilitários compartilhados pelos testes do T-RESULTS.
   O app é um arquivo único sem build, então os testes carregam o index.html
   de verdade — só que numa cópia instrumentada, para conseguir inspecionar o
   estado interno (que vive no escopo do módulo e não é acessível de fora). */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const APP = path.join(RAIZ, 'index.html');
/* a cópia fica ao lado do index.html para que ./icon-*.png e ./manifest.json
   continuem resolvendo pelos mesmos caminhos relativos */
const COPIA = path.join(RAIZ, '.test-app.html');

/* Ponte para o escopo do módulo. Sem isto não dá para verificar duração de
   treino, busca no histórico nem o áudio renderizado. */
const PONTE = `
/* injetado apenas na cópia de teste */
window.__t={
  get store(){return store}, get trS(){return trS}, get trRestEnd(){return trRestEnd},
  trElapsedMs:()=>trS?trElapsedMs():null, lastExSession, alarmWav, ALARM_VOL, todayKey,
  renderAlarm:async()=>{
    const oc=new OfflineAudioContext(1,44100*5,44100);
    const ctxAnterior=beepCtx, busAnterior=alarmBus;
    beepCtx=oc; alarmBus=null; alarmNodes=[];
    scheduleAlarm(0);
    const buf=await oc.startRendering();
    beepCtx=ctxAnterior; alarmBus=busAnterior; alarmNodes=[];
    const d=buf.getChannelData(0);
    let pico=0,soma=0,estouradas=0;
    for(let i=0;i<d.length;i++){
      const a=Math.abs(d[i]);
      if(a>pico)pico=a;
      if(a>=0.999)estouradas++;
      soma+=d[i]*d[i];
    }
    return {pico,rms:Math.sqrt(soma/d.length),estouradas};
  }};
`;
const ANCORA = '\n$("mealSel").value=defaultMeal();';

/** Gera a cópia instrumentada. Chamado uma vez, antes da suíte. */
function prepararCopia() {
  const src = fs.readFileSync(APP, 'utf8');
  if (!src.includes(ANCORA)) {
    throw new Error(
      'Âncora de injeção não encontrada no index.html. ' +
      'Se a linha `$("mealSel").value=defaultMeal();` mudou, atualize ANCORA em tests/app.js.'
    );
  }
  fs.writeFileSync(COPIA, src.replace(ANCORA, PONTE + ANCORA));
  return COPIA;
}

const urlApp = () => 'file://' + COPIA;

/* ---- Firebase falso ----
   O app faz `await import(...)` dos módulos do Firebase no topo do script.
   Sem interceptar, o teste trava esperando a rede. */
const FB_APP = `export function initializeApp(){return {};}`;
const FB_AUTH = `
export function getAuth(){return {};}
export function onAuthStateChanged(a,fn){setTimeout(()=>fn({uid:"u1",email:"teste@t-results.app"}),20);}
export function signInWithEmailAndPassword(){return Promise.resolve();}
export function createUserWithEmailAndPassword(){return Promise.resolve();}
export function signOut(){return Promise.resolve();}
export function sendPasswordResetEmail(){return Promise.resolve();}
export const EmailAuthProvider={credential:()=>({})};
export function reauthenticateWithCredential(){return Promise.resolve();}
export function deleteUser(){return Promise.resolve();}`;
const FB_FS = `
export function getFirestore(){return {};}
export function doc(){return {};}
export function getDoc(){return Promise.resolve({exists:()=>false});}
export function setDoc(){return Promise.resolve();}
export function deleteDoc(){return Promise.resolve();}
export function onSnapshot(){return ()=>{};}
export function serverTimestamp(){return 0;}`;

const js = (body) => ({ status: 200, contentType: 'application/javascript', body });

/** Intercepta Firebase e fontes no contexto do navegador. */
async function isolarRede(context) {
  await context.route('**/firebasejs/**/firebase-app.js', r => r.fulfill(js(FB_APP)));
  await context.route('**/firebasejs/**/firebase-auth.js', r => r.fulfill(js(FB_AUTH)));
  await context.route('**/firebasejs/**/firebase-firestore.js', r => r.fulfill(js(FB_FS)));
  await context.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

/** Coleta erros de JavaScript, ignorando 404 de ícone sob file://. */
function coletarErros(page) {
  const erros = [];
  page.on('pageerror', e => erros.push('JS: ' + String(e)));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push('console: ' + m.text());
  });
  return erros;
}

/** Abre o app com um estado inicial no armazenamento local. */
async function abrirApp(page, storage) {
  await isolarRede(page.context());
  const erros = coletarErros(page);
  await page.goto(urlApp());
  if (storage) {
    await page.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, storage);
    await page.reload();
  }
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return erros;
}

/** Data ISO de N dias atrás, no formato usado em store.tdays. */
const diaISO = (atras = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - atras);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

/** Usuário configurado, com um treino no protocolo. */
function estadoBase(extra = {}) {
  const store = {
    getd: 3000, days: {}, custom: [], liquids: {}, protocol: [], weights: [], tdays: {},
    goals: {
      nome: 'Pedro', pesoAtual: 80, pesoAlvo: 75, meses: 3, tIntro: true,
      sexo: 'M', idade: 30, altura: 180, ativ: 1.5, obj: 'cutting',
    },
    tprotocol: [{
      id: 'w1', nome: 'Treino A', cat: 'A', ex: [
        { n: 'Supino reto', s: 3, rest: 90, g: 'peito', sec: [] },
        { n: 'Remada curvada', s: 3, rest: 60, g: 'costas', sec: [] },
      ],
    }],
    ...extra,
  };
  return { 'cutting.v1': JSON.stringify(store), 'cutting.owner': 'u1' };
}

/** Navega até a aba de treino e inicia o primeiro treino do protocolo. */
async function iniciarTreino(page) {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForSelector('#tprotoCards [data-tw]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#tprotoCards [data-tw]').click());
  await page.waitForSelector('#trSets .tr-set', { timeout: 10000 });
}

/** Preenche uma série disparando os mesmos eventos que a digitação real dispara. */
async function preencherSerie(page, i, kg, reps, rir) {
  await page.evaluate(({ i, kg, reps, rir }) => {
    const row = document.querySelector(`#trSets .tr-set[data-i="${i}"]`);
    if (kg !== undefined) {
      const c = row.querySelector('.ikg');
      c.value = String(kg); c.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (reps !== undefined) {
      const r = row.querySelector('.irep');
      r.value = String(reps); r.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (rir !== undefined) row.querySelector(`[data-rir="${rir}"]`).click();
  }, { i, kg, reps, rir });
}

module.exports = {
  RAIZ, APP, COPIA, prepararCopia, urlApp,
  isolarRede, coletarErros, abrirApp,
  diaISO, estadoBase, iniciarTreino, preencherSerie,
};
