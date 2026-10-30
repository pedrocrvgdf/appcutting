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
  ALARM_DUR, ALARM_CICLO, restTick, ALARM_SONS, EX_POR_GRUPO,
  somDoAlarme:()=>somDoAlarme(), idadeDe, idadeAtual, computeTMB, buscaAlimentos, alimPontos, mapOff, ordenarOff, FOODS,
  appNativo:()=>appNativo,
  applyRemote, goalsParaNuvem, pushRemote:()=>pushRemote(true), naNuvem:()=>!!(cloudEnabled&&user),
  gastoDia, passosDia, baseSemRotina, kmAtividades, TACO, localList,
  academias, acadSel, acadDaSessao, treinoNaAcad, fdTodas, fdProgressao, fdSoEmOutra,
  startSync:()=>startSync(), sincronizar:()=>sincronizar(), mesclar, igual, paraNuvem:()=>copia(paraNuvem(store)),
  pendente, baseDe, salvar:()=>save(), get enviando(){return !!enviando},
  exTipo, evoData, propostaGetd, gastoBase, pesoConta, pesoNoDia, computeGETD, macroTargets, mesesTxt,
  listaProtocolos, protDoTreino, protPorId, protAberto, protAbertoAqui, protNomeDe, mesmoTreino, treinosDoProt, PROT_PADRAO, T_SUG,
  carimbarTid, raizTreino, acadsExcluidas, fracaoCorpo, tipoDe, corpoKgDe, corpoKgSessao, medidasSessao, PC_SEG,
  publicarPlanos:()=>publicarPlanos(), publicarDiario:f=>publicarDiario(f), sessoesParaTreinador, planoDe,
  get vinc(){return vinc}, get alunoAberto(){return alunoAberto}, ehTreinador:()=>ehTreinador(),
  appAlert, appConfirm, pausas:()=>pausas(), diasEntre, ultimoTreino, retornoDe, prDe, pausaAberta, PAUSA_AVISO_DIAS, PAUSA_QUEDA_DIAS, get trRecorde(){return trRecorde},
  EQUIP, EQUIP_ID, EX_EQUIP, EX_POR_GRUPO_: EX_POR_GRUPO, exEquip, equipFalta, equipFaltam,
  /* Trocar quem está logado, para alcançar o modo local — onde não há conta e
     portanto não há senha a conferir. */
  setUser:u=>{user=u;},
  alarmNodesLen:()=>alarmNodes.length,
  setRestEnd:v=>{trRestEnd=v;},
  forcarFimDoDescanso:()=>{trRestEnd=Date.now();restTick();},
  renderAlarm:async()=>{
    const oc=new OfflineAudioContext(1,44100*5,44100);
    const ctxAnterior=beepCtx, busAnterior=alarmBus;
    beepCtx=oc; alarmBus=null; alarmNodes=[];
    scheduleAlarm(0);
    const buf=await oc.startRendering();
    beepCtx=ctxAnterior; alarmBus=busAnterior; alarmNodes=[];
    const d=buf.getChannelData(0);
    let pico=0,soma=0,estouradas=0,cruzamentos=0;
    for(let i=0;i<d.length;i++){
      const a=Math.abs(d[i]);
      if(a>pico)pico=a;
      if(a>=0.999)estouradas++;
      soma+=d[i]*d[i];
      /* Cruzamentos por zero: sobe com a frequência. É como medir se o som
         escolhido chegou mesmo ao alarme, sem precisar de análise espectral.
         O limiar descarta o silêncio entre os toques, que cruzaria zero por
         ruído numérico e afogaria a medida. */
      if(i>0&&Math.abs(d[i])>0.01&&(d[i-1]<0)!==(d[i]<0))cruzamentos++;
    }
    return {pico,rms:Math.sqrt(soma/d.length),estouradas,cruzamentos};
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
/* window.__semLogin (posto por addInitScript) começa a sessão deslogada, para
   dar acesso à tela de entrada; sem ele o app entra sozinho, como antes. */
let aoMudar=null;
export function onAuthStateChanged(a,fn){
  aoMudar=fn;
  setTimeout(()=>fn(window.__semLogin?null:{uid:window.__uid||"u1",email:"teste@t-results.app"}),20);
}
export function signInWithEmailAndPassword(a,email,senha){
  window.__logins=window.__logins||[];
  window.__logins.push({email,senha});
  if(window.__senhaCerta!==undefined&&senha!==window.__senhaCerta){
    const e=new Error("senha incorreta");e.code="auth/invalid-credential";
    return Promise.reject(e);
  }
  window.__semLogin=false;
  if(aoMudar)setTimeout(()=>aoMudar({uid:"u1",email:email||"teste@t-results.app"}),5);
  return Promise.resolve();
}
/* window.__novaConta (um uid): criar a conta entra nela, como o Firebase de
   verdade — e a nuvem dessa conta nova não tem documento ainda. */
export function createUserWithEmailAndPassword(a,email){
  if(window.__contas)window.__contas.push(email);
  if(window.__novaConta&&aoMudar){const u={uid:window.__novaConta,email};setTimeout(()=>aoMudar(u),5);}
  return Promise.resolve();
}
export function signOut(){return Promise.resolve();}
export function sendPasswordResetEmail(){return Promise.resolve();}
export const EmailAuthProvider={credential:(email,senha)=>({email,senha})};
/* Registra o que foi conferido em window.__reauth. Enquanto window.__senhaCerta
   não for definida, aceita qualquer senha — é o comportamento que os testes
   antigos esperam; definindo, dá para provar que senha errada não apaga nada. */
export function reauthenticateWithCredential(user,cred){
  window.__reauth=window.__reauth||[];
  window.__reauth.push(cred);
  if(window.__senhaCerta!==undefined&&(!cred||cred.senha!==window.__senhaCerta)){
    const e=new Error("senha incorreta");e.code="auth/invalid-credential";
    return Promise.reject(e);
  }
  return Promise.resolve();
}
export function deleteUser(){return Promise.resolve();}`;
/* Chamadas às Cloud Functions ficam registradas em window.__fnCalls, e a
   resposta de cada uma vem de window.__fnRespostas. Sem resposta definida, a
   chamada falha — que é como o app se comporta antes de as funções serem
   publicadas. */
const FB_FN = `
export function getFunctions(){return {__falso:true};}
export function httpsCallable(fns,nome){
  return async dados=>{
    window.__fnCalls=window.__fnCalls||[];
    window.__fnCalls.push({nome,dados});
    const r=(window.__fnRespostas||{})[nome];
    if(r===undefined)throw new Error("função não publicada");
    return {data:r};
  };
}`;
/* Nuvem falsa. Por padrão ela não tem documento e aceita qualquer gravação
   sem guardar, como sempre foi. Com a chave "__nuvem" no armazenamento local
   (posta pelo teste), ela passa a ter estado: guarda o que é gravado e
   devolve na leitura — e, por viver no armazenamento, sobrevive a recarregar
   a página, que é como se simula o app descartado e aberto de novo.
   "__semRede" faz leitura e gravação falharem como sem sinal. */
const FB_FS = `
const temNuvem=()=>localStorage.getItem("__nuvem")!==null;
const semRede=()=>localStorage.getItem("__semRede")==="1";
const offline=()=>Promise.reject(Object.assign(new Error("offline"),{code:"unavailable"}));
export function getFirestore(){return {};}
/* O documento da conta (users/...) é o "__nuvem" de sempre. Os outros
   caminhos (convites, vínculos, planos, diários, #95) vivem em "__docs",
   um mapa caminho → documento, que também sobrevive a recarregar a página.
   Os testes mexem nele direto ("o outro aparelho") e chamam
   window.__notificar() para os ouvintes saberem. */
export function doc(db,...partes){return {path:partes.join("/")};}
const ehConta=r=>!r||!r.path||r.path.startsWith("users/");
const docs=()=>JSON.parse(localStorage.getItem("__docs")||"{}");
const gravarDocs=m=>localStorage.setItem("__docs",JSON.stringify(m));
const snapDoc=(path,d)=>({id:path.split("/").pop(),exists:()=>d!=null,data:()=>d==null?undefined:JSON.parse(JSON.stringify(d))});
export function collection(db,col){return {col};}
export function where(campo,op,valor){return {campo,op,valor};}
export function query(c,...ws){return {col:c.col,ws};}
function consulta(q){
  const m=docs(),out=[];
  for(const p of Object.keys(m).sort()){
    const [col,id,...resto]=p.split("/");
    if(col!==q.col||resto.length)continue;
    if((q.ws||[]).every(w=>w.op==="=="&&m[p]&&m[p][w.campo]===w.valor))out.push(snapDoc(p,m[p]));
  }
  return {docs:out,empty:!out.length,size:out.length,forEach:f=>out.forEach(f)};
}
export async function getDocs(q){if(semRede())return offline();return consulta(q);}
let ouvintes=[];
function avisar(){
  ouvintes.forEach(o=>{try{o.cb(o.ref.col?consulta(o.ref):snapDoc(o.ref.path,docs()[o.ref.path]));}catch(e){}});
}
window.__notificar=()=>avisar();
window.__ouvintesN=()=>ouvintes.length;
let leituras=0;
export async function getDoc(r){
  if(!ehConta(r)){
    if(semRede())return offline();
    window.__lidos=window.__lidos||[];window.__lidos.push(r.path);
    return snapDoc(r.path,docs()[r.path]);
  }
  if(!temNuvem())return {exists:()=>false};
  /* O documento é o do momento do pedido, como num servidor de verdade: a
     resposta que demora traz a versão de quando foi pedida. */
  const d=JSON.parse(localStorage.getItem("__nuvem"));
  /* "__lento": toda leitura demora tantos ms, para dar tempo de lançar algo
     com a transação no meio do caminho. "__lentoPrimeiro": só a primeira
     leitura da página (a da abertura) demora. */
  const ms=+(localStorage.getItem("__lento")||0)+(leituras++===0?+(localStorage.getItem("__lentoPrimeiro")||0):0);
  if(ms)await new Promise(r=>setTimeout(r,ms));
  if(semRede())return offline();
  return d?{exists:()=>true,data:()=>JSON.parse(JSON.stringify(d))}:{exists:()=>false};
}
export function setDoc(r,d,op){
  if(!ehConta(r)){
    if(semRede())return offline();
    const m=docs();
    m[r.path]=op&&op.merge&&m[r.path]?Object.assign({},m[r.path],JSON.parse(JSON.stringify(d))):JSON.parse(JSON.stringify(d));
    gravarDocs(m);
    window.__escritos=window.__escritos||[];window.__escritos.push(r.path);
    setTimeout(avisar,0);
    return Promise.resolve();
  }
  if(!temNuvem())return Promise.resolve();
  if(semRede())return offline();
  localStorage.setItem("__nuvem",JSON.stringify(d));
  localStorage.setItem("__gravacoes",String(+(localStorage.getItem("__gravacoes")||0)+1));
  return Promise.resolve();
}
export function updateDoc(r,parcial){
  if(semRede())return offline();
  const m=docs();
  if(!m[r.path])return Promise.reject(Object.assign(new Error("não existe"),{code:"not-found"}));
  m[r.path]=Object.assign({},m[r.path],JSON.parse(JSON.stringify(parcial)));
  gravarDocs(m);setTimeout(avisar,0);
  return Promise.resolve();
}
export function deleteDoc(r){
  if(ehConta(r))return Promise.resolve();
  if(semRede())return offline();
  const m=docs();delete m[r.path];gravarDocs(m);
  window.__apagados=window.__apagados||[];window.__apagados.push(r.path);
  setTimeout(avisar,0);
  return Promise.resolve();
}
/* O aviso de mudança do documento da conta fica em window.__aviso, para o
   teste disparar quando quiser — inclusive atrasado. Os outros caminhos e as
   consultas avisam sozinhos ao serem gravados daqui, e com
   window.__notificar() quando o teste mexe em "__docs" direto. Como no
   Firestore, o ouvinte recebe o estado atual logo ao se inscrever. */
export function onSnapshot(r,cb){
  if(ehConta(r)&&!r.col){window.__aviso=cb;return ()=>{};}
  const o={ref:r,cb};ouvintes.push(o);
  setTimeout(()=>{if(ouvintes.includes(o))try{cb(r.col?consulta(r):snapDoc(r.path,docs()[r.path]));}catch(e){}},0);
  return ()=>{ouvintes=ouvintes.filter(x=>x!==o);};
}
export function serverTimestamp(){return 0;}
/* A transação lê e grava pelo que estiver em window.__fb na hora: assim os
   testes que trocam getDoc/setDoc para simular a nuvem valem também para
   ela. */
export async function runTransaction(db,fn){
  const fb=window.__fb;
  let escrita=null;
  const tx={get:r=>fb.getDoc(r),set:(r,d)=>{escrita=[r,d];return tx;}};
  const out=await fn(tx);
  if(escrita)await fb.setDoc(escrita[0],escrita[1]);
  return out;
}`;

const js = (body) => ({ status: 200, contentType: 'application/javascript', body });

/** Intercepta Firebase e fontes no contexto do navegador. */
async function isolarRede(context) {
  await context.route('**/firebasejs/**/firebase-app.js', r => r.fulfill(js(FB_APP)));
  await context.route('**/firebasejs/**/firebase-auth.js', r => r.fulfill(js(FB_AUTH)));
  await context.route('**/firebasejs/**/firebase-firestore.js', r => r.fulfill(js(FB_FS)));
  await context.route('**/firebasejs/**/firebase-functions.js', r => r.fulfill(js(FB_FN)));
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
