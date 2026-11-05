/* Teste de carga: cem pessoas usando o T-RESULTS ao mesmo tempo (k6).

   O app é uma página estática; o que recebe carga de verdade é o Firebase:
   o login (Identity Toolkit) e a nuvem (Firestore). Cada pessoa virtual faz
   o que o celular faz:
   - entra na conta;
   - abre o app: lê o próprio documento (users/{uid});
   - a cada lançamento (série, refeição, água), salva como o app salva: lê
     o documento e grava o documento INTEIRO, com um tamanho realista (o app
     faz isso numa transação, que a API REST não abre para o login de uma
     pessoa comum; na nuvem, a transação é essa leitura e essa gravação);
   - às vezes pede a chave do aviso de descanso (função chavePush).

   As contas são de teste (carga-<rodada>-<n>@example.com, domínio reservado
   para exemplos, nenhum e-mail sai) e são APAGADAS no fim, junto com os
   documentos. Nada de quem usa o app é lido ou tocado: cada conta só alcança
   o próprio documento, pelas regras.

   Rodar (k6 instalado):
     k6 run tests-carga/cem-pessoas.js
   Variáveis: PESSOAS (100), DURACAO (3m), PAUSA_MIN/PAUSA_MAX em segundos
   entre lançamentos (5 e 15: bem mais apertado que uma pessoa de verdade,
   que lança uma série a cada 1 ou 2 minutos). */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const API_KEY = __ENV.API_KEY || 'AIzaSyBMe15gn6EYbh5mKArk-5nf-m_v5Fkinhg';   // a chave pública do index.html
const PROJETO = __ENV.PROJETO || 'trueresults-df5ce';
const REGIAO = __ENV.REGIAO || 'southamerica-east1';
const PESSOAS = Number(__ENV.PESSOAS || 100);
const DURACAO = __ENV.DURACAO || '3m';
const PAUSA_MIN = Number(__ENV.PAUSA_MIN || 5), PAUSA_MAX = Number(__ENV.PAUSA_MAX || 15);
const SITE = 'https://pedrocrvgdf.github.io';
const RODADA = __ENV.RODADA || String(Date.now()).slice(-7);

const AUTH = 'https://identitytoolkit.googleapis.com/v1';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;
const FUNCAO = `https://${REGIAO}-${PROJETO}.cloudfunctions.net/chavePush`;
const NAV = { Referer: SITE + '/appcutting/', Origin: SITE };   // como o navegador manda

const abrirMs = new Trend('abrir_app_ms', true);
const salvarMs = new Trend('salvar_ms', true);
const salvou = new Rate('salvou');

export const options = {
  setupTimeout: '5m',
  teardownTimeout: '5m',
  scenarios: {
    cem_pessoas: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: PESSOAS },   // as pessoas chegando
        { duration: DURACAO, target: PESSOAS }, // todas ao mesmo tempo
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    'http_req_failed{parte:nuvem}': ['rate<0.01'],
    'salvou': ['rate>0.99'],
    'salvar_ms': ['p(95)<2000'],
    'abrir_app_ms': ['p(95)<1500'],
  },
};

/* ---- O documento, em tamanho de gente que usa o app há um mês ---- */
function dia(n) { const d = new Date(Date.UTC(2026, 9, 1 + n)); return d.toISOString().slice(0, 10); }
function documentoRealista() {
  const days = {}, tdays = {}, liquids = {}, passos = {};
  const comida = ['Arroz branco', 'Feijão carioca', 'Frango grelhado', 'Ovo cozido', 'Banana', 'Whey protein'];
  for (let i = 0; i < 30; i++) {
    const dk = dia(i);
    days[dk] = comida.map((n, j) => ({ id: `f${i}_${j}`, name: n, grams: 100 + j * 10, unit: 'g', kcal: 120 + j * 15, p: 10 + j, c: 20 + j, g: 3 + j, status: 'consumido', meal: ['Café', 'Almoço', 'Lanche', 'Jantar'][j % 4], t: '12:30' }));
    liquids[dk] = 2000 + i * 10;
    passos[dk] = { n: 7000 + i * 50, inclui: false, peso: 82 };
    if (i % 2 === 0) tdays[dk] = [{ id: `s${i}`, name: 'Treino A', min: 55, kcal: 300, vol: 4200, tid: 'w1', pesoDia: 82,
      ex: ['Supino reto', 'Remada curvada', 'Agachamento livre', 'Desenvolvimento', 'Rosca direta'].map(n => ({ n, tipo: 'carga', sets: [{ kg: 60, rep: 10, rir: 2 }, { kg: 62.5, rep: 8, rir: 1 }, { kg: 60, rep: 9, rir: 1 }] })) }];
  }
  return {
    getd: 2650, days, tdays, liquids, passos, custom: [], protocol: [],
    weights: Array.from({ length: 30 }, (_, i) => ({ d: dia(i), w: 83 - i * 0.05 })),
    goals: { nome: 'Carga', pesoAtual: 83, pesoAlvo: 78, meses: 4, sexo: 'M', idade: 33, altura: 178, ativ: 1.55, obj: 'cutting' },
    tprotocol: [{ id: 'w1', nome: 'Treino A', cat: 'A', ex: [{ n: 'Supino reto', s: 3, rest: 90, g: 'peito', sec: [] }] }],
  };
}
/* JSON comum → formato de valores do Firestore (REST). */
function valor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { mapValue: { fields: campos(v) } };
}
function campos(o) { const f = {}; for (const k in o) f[k] = valor(o[k]); return f; }
const CAMPOS = campos(documentoRealista());
const TAMANHO_KB = Math.round(JSON.stringify(documentoRealista()).length / 1024);

const json = (body, extra = {}) => ({ headers: Object.assign({ 'Content-Type': 'application/json' }, NAV, extra.headers || {}), tags: extra.tags || { parte: 'nuvem' } });
const bearer = (tok, nome) => ({ headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, NAV), tags: { parte: 'nuvem', name: nome } });

/* ---- Antes: cria as contas de teste ---- */
export function setup() {
  console.log(`Rodada ${RODADA}: ${PESSOAS} pessoas, documento de ~${TAMANHO_KB} KB`);
  const contas = [];
  for (let ini = 0; ini < PESSOAS; ini += 20) {
    const lote = [];
    for (let i = ini; i < Math.min(PESSOAS, ini + 20); i++) {
      lote.push(['POST', `${AUTH}/accounts:signUp?key=${API_KEY}`,
        JSON.stringify({ email: `carga-${RODADA}-${i}@example.com`, password: `Carga!${RODADA}x${i}`, returnSecureToken: true }),
        json(null, { tags: { parte: 'login', name: 'criar conta' } })]);
    }
    const res = http.batch(lote);
    res.forEach((r, k) => {
      if (r.status === 200) { const b = r.json(); contas.push({ uid: b.localId, tok: b.idToken }); }
      else console.warn(`conta ${ini + k} não foi criada: ${r.status} ${String(r.body).slice(0, 160)}`);
    });
  }
  console.log(`${contas.length} de ${PESSOAS} contas de teste criadas`);
  if (!contas.length) throw new Error('nenhuma conta de teste foi criada');
  return { contas };
}

let avisos = 0;
function avisar(etapa, r) { if (avisos++ < 2) console.warn(`transação (${etapa}) recusada: ${r.status} ${String(r.body).slice(0, 300)}`); }

/* ---- Cada pessoa ---- */
export default function (dados) {
  const c = dados.contas[(__VU - 1) % dados.contas.length];
  const doc = `${DOCS}/users/${c.uid}`;
  if (__ITER === 0) {
    // abrir o app: a leitura da abertura (o documento ainda não existe na primeira vez)
    const r = http.get(doc, bearer(c.tok, 'abrir o app'));
    abrirMs.add(r.timings.duration);
    check(r, { 'abriu': x => x.status === 200 || x.status === 404 });
  }
  sleep(PAUSA_MIN + Math.random() * (PAUSA_MAX - PAUSA_MIN));

  // salvar: lê e grava o documento INTEIRO, como a transação do app. A API
  // REST recusa beginTransaction ao login de uma pessoa comum (403; o SDK do
  // app usa outro canal), então a transação vira o que ela faz na nuvem: uma
  // leitura e uma gravação do documento.
  const t0 = Date.now();
  http.get(doc, bearer(c.tok, 'salvar: ler'));
  const fields = Object.assign({}, CAMPOS, { atualizado: { integerValue: String(Date.now()) } });
  const w = http.patch(doc, JSON.stringify({ fields }), bearer(c.tok, 'salvar: gravar'));
  const ok = w.status === 200;
  if (!ok) avisar('gravar', w);
  salvarMs.add(Date.now() - t0);
  salvou.add(ok);
  check(ok, { 'salvou na nuvem': v => v });

  // às vezes: a chave do aviso de descanso (função do Firebase)
  if (Math.random() < 0.1) {
    http.post(FUNCAO, JSON.stringify({ data: {} }), { headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.tok }, NAV), tags: { parte: 'funcao', name: 'chavePush' } });
  }
}

/* ---- Depois: apaga os documentos e as contas de teste ---- */
export function teardown(dados) {
  let docs = 0, contas = 0;
  for (let ini = 0; ini < dados.contas.length; ini += 20) {
    const fatia = dados.contas.slice(ini, ini + 20);
    http.batch(fatia.map(c => ['DELETE', `${DOCS}/users/${c.uid}`, null, bearer(c.tok, 'apagar documento')])).forEach(r => { if (r.status === 200) docs++; });
    http.batch(fatia.map(c => ['POST', `${AUTH}/accounts:delete?key=${API_KEY}`, JSON.stringify({ idToken: c.tok }), json(null, { tags: { parte: 'login', name: 'apagar conta' } })])).forEach(r => { if (r.status === 200) contas++; });
  }
  console.log(`limpeza: ${docs} documentos e ${contas} contas de teste apagados, de ${dados.contas.length}`);
}
