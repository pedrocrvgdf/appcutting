/* Treinador e aluno (#95).

   O pedido: "quero que o app tenha a visão TREINADOR e ALUNO. Quero poder
   passar o treino para um aluno que vai baixar o app e editar o treino
   dele(a) e ver as cargas e as RIR e afins". O que pode dar errado, e cada
   teste aqui confere uma coisa:
   - o treinador escrever no documento do aluno (o celular do aluno grava o
     dele inteiro e apagaria): o treino vai por planos/{aluno};
   - o treino de um aluno vazar para outro, ou para o próprio treinador;
   - o aluno editar o que o treinador montou e ver a mudança sumir;
   - o diário levar o que o aluno não aceitou mostrar (peso, calorias,
     academia);
   - sem sinal, o plano se perder;
   - a conta nova perder o nome (e o papel) digitado no cadastro.

   A nuvem falsa guarda os outros caminhos em "__docs" (tests/app.js); o
   teste mexe nele direto, como o celular do outro lado, e chama
   window.__notificar(). As regras de verdade são testadas no emulador, em
   tests-regras/. */

const { test, expect } = require('@playwright/test');
const { estadoBase, diaISO, iniciarTreino, preencherSerie, urlApp, isolarRede, coletarErros } = require('./app');

/** Semeia o armazenamento UMA vez, antes de qualquer script do app, como em
    sem-sinal.spec.js. O abrirApp de sempre abre a página vazia, semeia e
    recarrega; aqui a página vazia, ouvindo o vínculo, lia o "__docs" recém-
    semeado, aplicava o plano e gravava o store vazio dela por cima do
    semeado. No app de verdade essa página vazia não existe. */
async function abrirApp(page, storage) {
  await isolarRede(page.context());
  const erros = coletarErros(page);
  await page.addInitScript(s => {
    if (sessionStorage.getItem('__semeado') || window.name === '__semeado') return;
    localStorage.clear();
    for (const k in s) localStorage.setItem(k, s[k]);
    sessionStorage.setItem('__semeado', '1');
    window.name = '__semeado';
  }, storage);
  await page.goto(urlApp());
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return erros;
}

/* ---- O lado do treinador ---- */

function estadoTreinador(extra = {}) {
  const store = {
    getd: 0, days: {}, custom: [], liquids: {}, protocol: [], weights: [], tdays: {}, passos: {},
    goals: { nome: 'Carla' }, tprotocol: [], papel: 'treinador', convite: 'ABC234', ...extra,
  };
  return { 'cutting.v1': JSON.stringify(store), 'cutting.owner': 'u1' };
}
const vinc = (aluno, nome, extra = {}) => ({
  treinador: 'u1', treinadorNome: 'Carla', aluno, alunoNome: nome, codigo: 'ABC234', desde: Date.UTC(2026, 0, 10, 12), pesos: false, ...extra,
});
const diarioAna = () => ({
  aluno: 'a1', atualizado: 1,
  sessoes: [
    { id: 's1', d: diaISO(1), name: 'Treino A', min: 52, rir: 1.5, tid: 'tw1', ex: [
      { n: 'Supino reto', g: 'peito', tipo: 'carga', sets: [{ kg: 60, rep: 10, rir: 2 }, { kg: 62.5, rep: 8, rir: 1 }] },
      { n: 'Barra fixa', g: 'costas', tipo: 'corpo', sets: [{ kg: 10, rep: 6, rir: 1 }] },
    ] },
    { id: 's0', d: diaISO(4), name: 'Treino A', min: 48, ex: [
      { n: 'Supino reto', g: 'peito', tipo: 'carga', sets: [{ kg: 57.5, rep: 10, rir: 2 }] },
    ] },
  ],
  pesos: [{ d: diaISO(1), w: 80.4 }, { d: diaISO(8), w: 81 }],
});
const docsTreinador = (extra = {}) => ({
  'convites/ABC234': { treinador: 'u1', nome: 'Carla', criado: 1 },
  'vinculos/a1': vinc('a1', 'Ana', { pesos: true }),
  'vinculos/a2': vinc('a2', 'Bruno'),
  'vinculos/x9': { ...vinc('x9', 'De outro treinador'), treinador: 'outro' },
  'diarios/a1': diarioAna(),
  ...extra,
});
const comDocs = (estado, docs) => ({ ...estado, __docs: JSON.stringify(docs) });
const docs = page => page.evaluate(() => JSON.parse(localStorage.getItem('__docs') || '{}'));
const viewOn = page => page.evaluate(() => document.querySelector('.view.on')?.id);
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const confirmar = async page => { await page.waitForSelector('#appDlgOverlay.open'); await clicar(page, '#appDlgOk'); await page.waitForTimeout(150); };
const abrirAluno = async (page, uid) => {
  await clicar(page, `[data-aluno="${uid}"]`);
  await page.waitForSelector('#view-aluno.on');
  await page.waitForTimeout(150);
};
const preencher = (page, d) => page.evaluate(dados => {
  for (const [id, v] of Object.entries(dados)) {
    const c = document.getElementById(id);
    c.value = v; c.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, d);
/** Pela tela, como o treinador faz: protocolo novo e um treino nele. */
async function montarProtocolo(page, nome, treino, exercicio) {
  await clicar(page, '#alProtNovo');
  await page.waitForSelector('#protNovoOverlay.open');
  await preencher(page, { protNovoNome: nome });
  await clicar(page, '#protNovoOk');
  await page.waitForSelector('#tprotoOverlay.open');
  await clicar(page, '#tpNew');
  await page.waitForSelector('#tpEditOverlay.open');
  await preencher(page, { tpName: treino, tpExName: exercicio, tpExS: '4' });
  await clicar(page, '#tpExAdd');
  await clicar(page, '#tpSave');
  await page.waitForTimeout(150);
  await clicar(page, '#tpClose');
  await page.waitForTimeout(150);
}

test.describe('Treinador', () => {

  test('a conta de treinador abre nos alunos, com a barra só de Alunos e Perfil', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await page.waitForTimeout(300);
    expect(await viewOn(page)).toBe('view-alunos');
    const r = await page.evaluate(() => ({
      abas: [...document.querySelectorAll('#tabbar button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim()),
      codigo: document.getElementById('alCodigo').textContent,
      alunos: [...document.querySelectorAll('#alLista .al-n')].map(e => e.textContent),
      meta: [...document.querySelectorAll('#alLista .al-m')].map(e => e.textContent),
      objetivo: getComputedStyle(document.querySelector('.pfgoal')).display,
    }));
    expect(r.abas).toEqual(['Alunos', 'Perfil']);
    expect(r.codigo).toBe('ABC234');
    expect(r.alunos, 'só os alunos deste treinador').toEqual(['Ana', 'Bruno']);
    expect(r.meta[0]).toContain('último treino: ontem');
    expect(r.meta[1]).toContain('sem treino montado');
    expect(r.objetivo, 'o treinador não tem objetivo nem dieta').toBe('none');
    // as telas de quem treina não abrem para ele
    await clicar(page, '#tabbar [data-tab="inicio"]');
    expect(await viewOn(page)).toBe('view-alunos');
    expect(erros).toEqual([]);
  });

  test('montar o treino do aluno: o protocolo é só dele, e o plano sobe sem a marca interna', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await abrirAluno(page, 'a1');
    expect(await page.textContent('#alProts')).toContain('Nenhum protocolo ainda');
    await montarProtocolo(page, 'Hipertrofia', 'Peito', 'Supino reto');

    const st = await page.evaluate(() => ({ p: __t.store.tprotos, w: __t.store.tprotocol }));
    expect(st.p).toEqual([expect.objectContaining({ nome: 'Hipertrofia', aluno: 'a1' })]);
    expect(st.w).toEqual([expect.objectContaining({ nome: 'Peito', aluno: 'a1', prot: st.p[0].id })]);

    await page.waitForFunction(() => JSON.parse(localStorage.getItem('__docs'))['planos/a1'], null, { timeout: 5000 });
    const d = await docs(page);
    const plano = d['planos/a1'];
    expect([plano.treinador, plano.treinadorNome]).toEqual(['u1', 'Carla']);
    expect(plano.tprotos).toEqual([{ id: st.p[0].id, nome: 'Hipertrofia' }]);
    expect(plano.tprotocol.map(w => [w.nome, w.prot, w.ex.map(e => [e.n, e.s])])).toEqual([['Peito', st.p[0].id, [['Supino reto', 4]]]]);
    expect('aluno' in plano.tprotocol[0], 'a marca do treinador fica no documento dele').toBe(false);
    expect(d['planos/a2'], 'quem não tem treino montado não recebe plano').toBeUndefined();
    await page.waitForTimeout(100);
    expect(await page.textContent('#alPub')).toBe('Enviado ao aluno');

    // na tela do Bruno, nada do treino da Ana; e ele pode ter um "Hipertrofia" também
    await clicar(page, '#view-aluno [data-volta="alunos"]');
    await abrirAluno(page, 'a2');
    expect(await page.textContent('#alProts')).toContain('Nenhum protocolo ainda');
    await montarProtocolo(page, 'Hipertrofia', 'Costas', 'Remada curvada');
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open')), 'o nome repetido é de outro aluno').toBe(false);
    const p2 = await page.evaluate(() => __t.store.tprotos.filter(p => p.aluno === 'a2').map(p => p.nome));
    expect(p2).toEqual(['Hipertrofia']);
    await page.evaluate(() => __t.publicarPlanos());
    await page.waitForTimeout(100);
    const d2 = await docs(page);
    expect(d2['planos/a2'].tprotocol.map(w => w.nome)).toEqual(['Costas']);
    expect(d2['planos/a1'].tprotocol.map(w => w.nome), 'o da Ana não mudou').toEqual(['Peito']);
    expect(erros).toEqual([]);
  });

  test('sem sinal, o plano espera e sai quando a internet volta', async ({ page }) => {
    const est = estadoTreinador({
      tprotos: [{ id: 'p1', nome: 'Força', aluno: 'a1' }],
      tprotocol: [{ id: 'tw1', nome: 'A', cat: 'A', prot: 'p1', protNome: 'Força', aluno: 'a1', ex: [{ n: 'Agachamento livre', s: 4, rest: 120, g: 'quadriceps', sec: [] }] }],
    });
    await abrirApp(page, { ...comDocs(est, docsTreinador()), __semRede: '1' });
    await abrirAluno(page, 'a1');
    await page.evaluate(() => __t.publicarPlanos());
    await page.waitForTimeout(150);
    expect((await docs(page))['planos/a1']).toBeUndefined();
    expect(await page.textContent('#alPub')).toBe('Sem sinal: vai quando a internet voltar');
    await page.evaluate(() => { localStorage.removeItem('__semRede'); window.dispatchEvent(new Event('online')); });
    await page.waitForTimeout(200);
    expect((await docs(page))['planos/a1'].tprotocol.map(w => w.nome)).toEqual(['A']);
    expect(await page.textContent('#alPub')).toBe('Enviado ao aluno');
  });

  test('o treinador vê cada série com carga e RIR, a evolução e o peso (só de quem compartilha)', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await abrirAluno(page, 'a1');
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const card = document.querySelector('#alSessoes .fd-card');
      card.querySelector('[data-altog]').click();
      return {
        nome: card.querySelector('.fd-nome .n').textContent, h: card.querySelector('.fd-nome .h').textContent,
        aberto: card.classList.contains('aberto'),
        stats: [...card.querySelectorAll('.fd-stat .v')].map(e => e.textContent),
        series: [...card.querySelectorAll('.al-serie')].map(e => [...e.children].map(c => c.textContent).join(' ').trim()),
        sub: document.getElementById('alSub').textContent,
        evoOps: [...document.querySelectorAll('#alEvoEx option')].map(o => o.value),
        evo: [...document.querySelectorAll('#alEvo .al-evo span')].map(e => e.textContent),
        peso: [...document.querySelectorAll('#alPeso .al-evo span')].map(e => e.textContent),
      };
    });
    expect([r.nome, r.h, r.aberto]).toEqual(['Treino A', 'Ontem · 2 exercícios · 3 séries', true]);
    expect(r.stats).toEqual(['52', '1,5', '3']);
    expect(r.series).toEqual(['Série 1: 60 kg × 10 RIR 2', 'Série 2: 62,5 kg × 8 RIR 1', 'Série 1: +10 kg × 6 RIR 1']);
    expect(r.sub).toContain('compartilha o peso');
    expect(r.evoOps).toEqual(['Supino reto', 'Barra fixa']);
    expect(r.evo.slice(0, 3), 'a melhor série de cada vez').toEqual(['Ontem', '62,5 kg × 8', 'RIR 1']);
    expect(r.evo[4]).toBe('57,5 kg × 10');
    expect(r.peso.slice(0, 3)).toEqual(['Ontem', '80,4 kg', '−0,6 kg']);

    await clicar(page, '#view-aluno [data-volta="alunos"]');
    await abrirAluno(page, 'a2');
    expect(await page.textContent('#alPeso')).toContain('não compartilha o peso');
  });

  test('desfazer a ligação pelo treinador apaga o plano e o vínculo', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador({ 'planos/a1': { treinador: 'u1', tprotos: [], tprotocol: [] } })));
    await abrirAluno(page, 'a1');
    await clicar(page, '#alDesfazer');
    await confirmar(page);
    await page.waitForTimeout(150);
    const d = await docs(page);
    expect([d['planos/a1'], d['vinculos/a1']]).toEqual([undefined, undefined]);
    expect(await viewOn(page)).toBe('view-alunos');
    expect(await page.evaluate(() => [...document.querySelectorAll('#alLista .al-n')].map(e => e.textContent))).toEqual(['Bruno']);
  });

  test('aluno que desfez e voltou recebe o plano de novo', async ({ page }) => {
    const est = estadoTreinador({
      tprotos: [{ id: 'p1', nome: 'Força', aluno: 'a1' }],
      tprotocol: [{ id: 'tw1', nome: 'A', cat: 'A', prot: 'p1', protNome: 'Força', aluno: 'a1', ex: [] }],
    });
    await abrirApp(page, comDocs(est, docsTreinador()));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('__docs'))['planos/a1']);
    // o aluno desfez: apagou o plano e o vínculo
    await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('__docs')); delete m['planos/a1']; delete m['vinculos/a1']; localStorage.setItem('__docs', JSON.stringify(m)); window.__notificar(); });
    await page.waitForTimeout(150);
    // e voltou com o código
    await page.evaluate(v => { const m = JSON.parse(localStorage.getItem('__docs')); m['vinculos/a1'] = v; localStorage.setItem('__docs', JSON.stringify(m)); window.__notificar(); }, vinc('a1', 'Ana'));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('__docs'))['planos/a1'], null, { timeout: 3000 });
    expect((await docs(page))['planos/a1'].tprotocol.map(w => w.nome)).toEqual(['A']);
  });

  test('o aluno desfez com a tela dele aberta: ela fecha, com aviso', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await abrirAluno(page, 'a1');
    await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('__docs')); delete m['vinculos/a1']; localStorage.setItem('__docs', JSON.stringify(m)); window.__notificar(); });
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toContain('Ana desfez a ligação');
    expect(await viewOn(page)).toBe('view-alunos');
  });

  test('trocar o código: o novo vale, o antigo é apagado, e quem já é aluno continua', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#alTrocar');
    await confirmar(page);
    await page.waitForFunction(() => __t.store.convite !== 'ABC234');
    const c = await page.evaluate(() => __t.store.convite);
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const d = await docs(page);
    expect(d['convites/ABC234']).toBeUndefined();
    expect(d['convites/' + c]).toEqual(expect.objectContaining({ treinador: 'u1', nome: 'Carla' }));
    expect(d['vinculos/a1']).toBeDefined();
    expect(await page.textContent('#alCodigo')).toBe(c);
  });

  test('enviar o convite manda o link com o código', async ({ page }) => {
    await page.addInitScript(() => { navigator.share = d => { window.__compartilhado = d; return Promise.resolve(); }; });
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#alEnviar');
    await page.waitForTimeout(100);
    const t = await page.evaluate(() => window.__compartilhado.text);
    expect(t, 'o link leva à página que ensina a instalar o app e o Obtainium (#97)').toContain('https://pedrocrvgdf.github.io/appcutting/convite.html?c=ABC234');
    expect(t).toContain('Seu código: ABC234');
    expect(t).toContain('Carla');
  });

  for (const largura of [320, 390]) {
    test(`em ${largura} px, alunos e aluno cabem sem rolar de lado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await abrirApp(page, comDocs(estadoTreinador({
        tprotos: [{ id: 'p1', nome: 'Hipertrofia com nome bem comprido', aluno: 'a1' }],
        tprotocol: [{ id: 'tw1', nome: 'Peito, ombro e tríceps', cat: 'A', prot: 'p1', protNome: 'Hipertrofia com nome bem comprido', aluno: 'a1', ex: [{ n: 'Supino reto', s: 4, rest: 90, g: 'peito', sec: [] }] }],
      }), docsTreinador()));
      const rola = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(await rola()).toBe(false);
      await abrirAluno(page, 'a1');
      await page.evaluate(() => document.querySelector('#alSessoes [data-altog]').click());
      expect(await rola()).toBe(false);
    });
  }
});

test.describe('Criar conta', () => {
  const deslogado = page => page.addInitScript(() => { window.__semLogin = true; window.__novaConta = 't9'; });

  test('conta de treinador: sem data de nascimento, com o papel, o nome e o código', async ({ page }) => {
    await deslogado(page);
    await abrirApp(page, estadoBase());
    await clicar(page, '#btnSignup');
    await page.waitForSelector('#cadastroOverlay.open');
    await clicar(page, '#cadPapelSeg [data-v="treinador"]');
    expect(await page.isVisible('#cadNasc'), 'a data só serve para a conta de calorias').toBe(false);
    expect(await page.isVisible('#cadPapelNota')).toBe(true);
    await preencher(page, { cadNome: 'Carla Souza', cadEmail: 'carla@t-results.app', cadSenha: 'senha123' });
    await clicar(page, '#cadCriar');
    await page.waitForFunction(() => document.querySelector('.view.on')?.id === 'view-alunos', null, { timeout: 5000 });
    await page.waitForFunction(() => !!__t.store.convite, null, { timeout: 5000 });
    const r = await page.evaluate(() => ({ papel: __t.store.papel, nome: __t.store.goals.nome, nasc: __t.store.goals.nasc, convite: __t.store.convite, dono: localStorage.getItem('cutting.owner') }));
    expect([r.papel, r.nome, r.nasc, r.dono]).toEqual(['treinador', 'Carla Souza', undefined, 't9']);
    expect((await docs(page))['convites/' + r.convite]).toEqual(expect.objectContaining({ treinador: 't9', nome: 'Carla Souza' }));
  });

  test('conta nova de quem treina não perde o nome: a nuvem vazia não apaga o cadastro', async ({ page }) => {
    await deslogado(page);
    await abrirApp(page, estadoBase());
    await clicar(page, '#btnSignup');
    await page.waitForSelector('#cadastroOverlay.open');
    const h = new Date(), nasc = `${h.getFullYear() - 30}-01-15`;
    await preencher(page, { cadNome: 'Pedro Henrique', cadNasc: nasc, cadEmail: 'novo@t-results.app', cadSenha: 'senha123' });
    await clicar(page, '#cadCriar');
    await page.waitForFunction(() => localStorage.getItem('cutting.owner') === 't9', null, { timeout: 5000 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ nome: __t.store.goals.nome, nasc: __t.store.goals.nasc, papel: __t.store.papel, treino: (__t.store.tprotocol || []).length }));
    expect(r).toEqual({ nome: 'Pedro Henrique', nasc, papel: undefined, treino: 0 });
    expect(await viewOn(page)).not.toBe('view-welcome');
  });
});

/* ---- O lado do aluno ---- */

const PLANO = (extra = {}) => ({
  treinador: 't1', treinadorNome: 'Carla', atualizado: 1,
  tprotos: [{ id: 'pt', nome: 'Hipertrofia' }],
  tprotocol: [{ id: 'tw1', nome: 'Peito', cat: 'A', prot: 'pt', protNome: 'Hipertrofia', ex: [{ n: 'Supino reto', s: 4, rest: 90, g: 'peito', sec: [] }] }],
  ...extra,
});
const VINC_ALUNO = (extra = {}) => ({ treinador: 't1', treinadorNome: 'Carla', aluno: 'u1', alunoNome: 'Pedro', codigo: 'ABC234', desde: Date.UTC(2026, 1, 3, 12), pesos: false, ...extra });
const docsAluno = (extra = {}) => ({
  'convites/ABC234': { treinador: 't1', nome: 'Carla', criado: 1 },
  'vinculos/u1': VINC_ALUNO(),
  'planos/u1': PLANO(),
  ...extra,
});
const irPerfil = async page => { await clicar(page, '#tabbar [data-tab="perfil"]'); await page.waitForTimeout(150); };

test.describe('Aluno', () => {

  test('ligar-se com o código: vê o que o treinador vai ver, e o peso começa desligado', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoBase(), { 'convites/ABC234': { treinador: 't1', nome: 'Carla', criado: 1 } }));
    await irPerfil(page);
    expect(await page.isVisible('#pfTreinLigar')).toBe(true);
    await clicar(page, '#pfTreinLigar');
    await page.waitForSelector('#vincOverlay.open');
    const tentar = async cod => { await preencher(page, { vincCodigo: cod }); await clicar(page, '#vincOk'); await page.waitForTimeout(150); return page.textContent('#vincMsg'); };
    expect(await tentar('abc 23')).toContain('6 letras e números');
    expect(await tentar('QQQ222')).toContain('Não achei esse código');
    expect(await tentar('abc234')).toBe('');
    const r = await page.evaluate(() => ({
      nome: document.getElementById('vincNome').textContent,
      lista: document.querySelector('.vinc-lista').textContent,
      nao: document.querySelector('.vinc-nao').textContent,
      peso: document.getElementById('vincPesos').checked,
      botao: document.getElementById('vincOk').textContent,
    }));
    expect(r.nome).toBe('Carla');
    expect(r.lista).toContain('cargas, repetições, RIR');
    expect(r.nao).toContain('alimentação');
    expect(r.peso, 'o peso só vai se o aluno ligar').toBe(false);
    expect(r.botao).toBe('Aceitar');
    await clicar(page, '#vincOk');
    await page.waitForSelector('#appDlgOverlay.open');
    const v = (await docs(page))['vinculos/u1'];
    expect(v).toEqual(expect.objectContaining({ treinador: 't1', treinadorNome: 'Carla', aluno: 'u1', alunoNome: 'Pedro', codigo: 'ABC234', pesos: false }));
    expect(await page.textContent('#pfTrein')).toContain('Carla');
    expect(erros).toEqual([]);
  });

  test('o treino do treinador chega só de leitura, e o do próprio aluno continua dele', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoBase(), docsAluno()));
    await page.waitForFunction(() => (__t.store.tprotos || []).some(p => p.treinador));
    const st = await page.evaluate(() => ({ p: __t.store.tprotos, w: __t.store.tprotocol.map(w => [w.id, w.treinador || null]) }));
    expect(st.p[0]).toEqual({ id: 'pt', nome: 'Hipertrofia', treinador: 't1', treinadorNome: 'Carla' });
    expect(st.w).toEqual([['w1', null], ['tw1', 't1']]);

    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForTimeout(200);
    const aba = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('#tprotoCards .pcname')].map(e => e.textContent),
      dono: document.querySelector('.prot-dono')?.textContent,
      botao: document.getElementById('tOpenProtocol').textContent,
    }));
    expect(aba.cards, 'abre no protocolo que acabou de chegar').toEqual(['Peito']);
    expect(aba.dono).toContain('Montado por Carla');
    expect(aba.botao.startsWith('Ver')).toBe(true);

    await clicar(page, '#tOpenProtocol');
    await page.waitForSelector('#tprotoOverlay.open');
    const ro = await page.evaluate(() => ({
      novo: getComputedStyle(document.getElementById('tpNew')).display,
      editar: document.querySelectorAll('#tprotoList [data-ted], #tprotoList [data-tdl]').length,
      nota: document.getElementById('tpRoNota').textContent,
      titulo: document.getElementById('tpProtNome').readOnly,
      excluir: getComputedStyle(document.getElementById('tpProtDel')).display,
      pdf: getComputedStyle(document.getElementById('tpPdf')).display !== 'none',
    }));
    expect(ro).toEqual({ novo: 'none', editar: 0, nota: expect.stringContaining('só o treinador muda'), titulo: true, excluir: 'none', pdf: true });
    await clicar(page, '#tpClose');

    // o protocolo do próprio aluno continua editável
    await page.evaluate(() => __t.listaProtocolos().length);
    const proprio = await page.evaluate(() => __t.listaProtocolos().map(p => p.id));
    expect(proprio).toEqual(['pt', 'principal']);
    expect(erros).toEqual([]);
  });

  test('a mudança do treinador chega sozinha; plano de outro treinador não entra', async ({ page }) => {
    await abrirApp(page, comDocs(estadoBase(), docsAluno()));
    await page.waitForFunction(() => (__t.store.tprotocol || []).some(w => w.id === 'tw1'));
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('__docs'));
      m['planos/u1'].tprotocol = [{ id: 'tw1', nome: 'Peito e tríceps', cat: 'A', prot: 'pt', protNome: 'Hipertrofia', ex: [{ n: 'Supino reto', s: 4, rest: 90, g: 'peito', sec: [] }, { n: 'Tríceps corda', s: 3, rest: 60, g: 'triceps', sec: [] }] },
        { id: 'tw2', nome: 'Pernas', cat: 'B', prot: 'pt', protNome: 'Hipertrofia', ex: [{ n: 'Leg press', s: 4, rest: 90, g: 'quadriceps', sec: [] }] }];
      localStorage.setItem('__docs', JSON.stringify(m)); window.__notificar();
    });
    await page.waitForTimeout(150);
    const a = await page.evaluate(() => __t.store.tprotocol.filter(w => w.treinador).map(w => [w.nome, w.ex.length]));
    expect(a).toEqual([['Peito e tríceps', 2], ['Pernas', 1]]);

    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('__docs'));
      m['planos/u1'] = { ...m['planos/u1'], treinador: 'outro', tprotocol: [] };
      localStorage.setItem('__docs', JSON.stringify(m)); window.__notificar();
    });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.tprotocol.filter(w => w.treinador).length), 'plano de quem não é o treinador dele').toBe(2);
  });

  test('id do plano que já é do aluno não entra: o treino dele não vira só de leitura', async ({ page }) => {
    const plano = PLANO({
      tprotos: [{ id: 'principal', nome: 'Invasor' }, { id: 'pt', nome: 'Hipertrofia' }],
      tprotocol: [
        { id: 'w1', nome: 'Treino A do treinador', cat: 'A', prot: 'pt', ex: [] },
        { id: 'tw1', nome: 'Peito', cat: 'A', prot: 'pt', ex: [] },
        { id: 'tw9', nome: 'No principal', cat: 'B', prot: 'principal', ex: [] },
      ],
    });
    await abrirApp(page, comDocs(estadoBase(), docsAluno({ 'planos/u1': plano })));
    await page.waitForFunction(() => (__t.store.tprotos || []).some(p => p.treinador));
    const st = await page.evaluate(() => ({ p: __t.store.tprotos.map(p => [p.id, p.treinador || null]), w: __t.store.tprotocol.map(w => [w.id, w.nome, w.treinador || null]) }));
    expect(st.p).toEqual([['pt', 't1'], ['principal', null]]);
    expect(st.w).toEqual([['w1', 'Treino A', null], ['tw1', 'Peito', 't1']]);
  });

  test('treinar o treino do treinador: a sessão é do aluno e sobe no diário, sem o que ele não aceitou mostrar', async ({ page }) => {
    const est = estadoBase({ weights: [{ d: diaISO(2), w: 80 }], academias: [{ id: 'a1', nome: 'Smart Fit' }] });
    await abrirApp(page, comDocs(est, docsAluno()));
    await page.waitForFunction(() => (__t.store.tprotocol || []).some(w => w.id === 'tw1'));
    await iniciarTreino(page);
    expect(await page.evaluate(() => __t.trS.w.id)).toBe('tw1');
    await preencherSerie(page, 0, 60, 10, 2);
    await clicar(page, '#trNext');
    await page.waitForTimeout(400);
    const sess = await page.evaluate(() => __t.store.tdays[__t.todayKey()][0]);
    expect([sess.tid, sess.prot, sess.protNome]).toEqual(['tw1', 'pt', 'Hipertrofia']);

    await page.waitForFunction(() => ((JSON.parse(localStorage.getItem('__docs'))['diarios/u1'] || {}).sessoes || []).length, null, { timeout: 5000 });
    const d = (await docs(page))['diarios/u1'];
    expect(d.aluno).toBe('u1');
    expect('pesos' in d, 'sem permissão, nenhuma pesagem').toBe(false);
    const s = d.sessoes[0];
    expect(s).toEqual(expect.objectContaining({ name: 'Peito', tid: 'tw1', d: await page.evaluate(() => __t.todayKey()) }));
    expect(s.ex[0]).toEqual({ n: 'Supino reto', g: 'peito', tipo: 'carga', sets: [{ kg: 60, rep: 10, rir: 2 }] });
    for (const k of ['pesoDia', 'kcal', 'vol', 'acad', 'acadNome']) expect(k in s, k).toBe(false);
  });

  test('ligar o peso: o vínculo muda antes, e o diário passa a levar as pesagens', async ({ page }) => {
    const est = estadoBase({ weights: [{ d: diaISO(2), w: 80 }, { d: diaISO(500), w: 90 }], tdays: { [diaISO(1)]: [{ id: 'z1', name: 'Treino A', min: 40, kcal: 250, vol: 3000, pesoDia: 80, ex: [{ n: 'Barra fixa', g: 'costas', tipo: 'corpo', corpoKg: 80, sets: [{ kg: 10, rep: 6, rir: 1 }] }] }] } });
    await abrirApp(page, comDocs(est, docsAluno()));
    await page.evaluate(() => __t.publicarDiario(true));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('__docs'))['diarios/u1'], null, { timeout: 5000 });
    let d = (await docs(page))['diarios/u1'];
    expect('pesos' in d).toBe(false);
    expect(['pesoDia', 'kcal', 'vol'].map(k => k in d.sessoes[0]).concat('corpoKg' in d.sessoes[0].ex[0])).toEqual([false, false, false, false]);

    await irPerfil(page);
    await page.evaluate(() => { const c = document.getElementById('pfTreinPeso'); c.checked = true; c.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => 'pesos' in (JSON.parse(localStorage.getItem('__docs'))['diarios/u1'] || {}), null, { timeout: 5000 });
    d = await docs(page);
    expect(d['vinculos/u1'].pesos).toBe(true);
    expect(d['diarios/u1'].pesos, 'só o último ano').toEqual([{ d: diaISO(2), w: 80 }]);
    expect(d['diarios/u1'].sessoes[0]).toEqual(expect.objectContaining({ pesoDia: 80, kcal: 250 }));
    expect(d['diarios/u1'].sessoes[0].ex[0].corpoKg).toBe(80);
  });

  test('o aluno desfaz: some o vínculo, o plano e o diário, e o treino passa a ser dele', async ({ page }) => {
    await abrirApp(page, comDocs(estadoBase(), docsAluno({ 'diarios/u1': { aluno: 'u1', sessoes: [] } })));
    await page.waitForFunction(() => (__t.store.tprotos || []).some(p => p.treinador));
    await irPerfil(page);
    await clicar(page, '#pfTreinSair');
    await confirmar(page);
    await page.waitForTimeout(150);
    const d = await docs(page);
    expect([d['vinculos/u1'], d['planos/u1'], d['diarios/u1']]).toEqual([undefined, undefined, undefined]);
    const st = await page.evaluate(() => ({ p: __t.store.tprotos.find(p => p.id === 'pt'), w: __t.store.tprotocol.find(w => w.id === 'tw1') }));
    expect(st.p).toEqual({ id: 'pt', nome: 'Hipertrofia' });
    expect('treinador' in st.w).toBe(false);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open')), 'sem o aviso de "ele desfez"').toBe(false);
    expect(await page.isVisible('#pfTreinLigar')).toBe(true);
  });

  test('o treinador desfez: aviso, e o treino fica com o aluno', async ({ page }) => {
    await abrirApp(page, comDocs(estadoBase(), docsAluno()));
    await page.waitForFunction(() => (__t.store.tprotos || []).some(p => p.treinador));
    await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('__docs')); delete m['vinculos/u1']; localStorage.setItem('__docs', JSON.stringify(m)); window.__notificar(); });
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toContain('Carla desfez a ligação');
    expect(await page.evaluate(() => __t.store.tprotos.some(p => p.treinador))).toBe(false);
  });

  test('o link do convite abre o pedido já preenchido, depois de entrar', async ({ page }) => {
    await abrirApp(page, comDocs(estadoBase(), { 'convites/ABC234': { treinador: 't1', nome: 'Carla', criado: 1 } }));
    await page.goto(urlApp() + '?convite=abc234');
    await page.waitForSelector('#vincOverlay.open', { timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('vincNome').textContent === 'Carla');
    expect(await page.evaluate(() => [location.search, document.getElementById('vincOk').textContent])).toEqual(['', 'Aceitar']);
  });

  test('outra conta no mesmo celular não herda o treinador da anterior', async ({ page }) => {
    await page.addInitScript(() => { window.__uid = 'u2'; });
    const est = { ...estadoBase(), 'tresults.vinculo': JSON.stringify({ uid: 'u1', v: { treinador: 't1', treinadorNome: 'Carla', desde: 1, pesos: true } }) };
    await abrirApp(page, comDocs(est, docsAluno()));
    await irPerfil(page);
    expect(await page.evaluate(() => __t.vinc)).toBeNull();
    expect(await page.isVisible('#pfTreinLigar')).toBe(true);
  });

  test('o aluno não tem a aba Alunos, nem chega à tela dela', async ({ page }) => {
    await abrirApp(page, comDocs(estadoBase(), {}));
    expect(await page.isVisible('#tabbar [data-tab="alunos"]')).toBe(false);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="alunos"]').click());
    expect(await viewOn(page)).not.toBe('view-alunos');
  });

  /* "Excluir dados" troca o store por um vazio. */
  const excluirDados = async page => {
    await irPerfil(page);
    await clicar(page, '#pfReset');
    await page.waitForTimeout(250);
    const msg = await page.textContent('#dgMsg').catch(() => '');
    await preencher(page, { dgPw: 'senha123' });
    await clicar(page, '#dgConfirm');
    await page.waitForTimeout(400);
    return msg;
  };

  test('excluir dados: o treinador continua treinador, com o mesmo código', async ({ page }) => {
    const est = estadoTreinador({ tprotos: [{ id: 'p1', nome: 'Força', aluno: 'a1' }], tprotocol: [{ id: 'tw1', nome: 'A', cat: 'A', prot: 'p1', aluno: 'a1', ex: [] }] });
    await abrirApp(page, comDocs(est, docsTreinador()));
    const msg = await excluirDados(page);
    expect(msg).toContain('protocolos que você montou para os seus alunos');
    const st = await page.evaluate(() => ({ papel: __t.store.papel, convite: __t.store.convite, prot: (__t.store.tprotos || []).length, w: __t.store.tprotocol.length }));
    expect(st).toEqual({ papel: 'treinador', convite: 'ABC234', prot: 0, w: 0 });
    // o nome foi junto: a tela pede, e depois volta aos alunos, sem passar pelo objetivo
    expect(await viewOn(page)).toBe('view-welcome');
    await preencher(page, { welcomeName: 'Carla' });
    await clicar(page, '#welcomeGo');
    await page.waitForTimeout(200);
    expect(await viewOn(page)).toBe('view-alunos');
  });

  test('excluir dados: o aluno recebe de volta o treino que o treinador montou', async ({ page }) => {
    await abrirApp(page, comDocs(estadoBase(), docsAluno()));
    await page.waitForFunction(() => (__t.store.tprotocol || []).some(w => w.id === 'tw1'));
    await excluirDados(page);
    const st = await page.evaluate(() => ({ w: __t.store.tprotocol.map(w => [w.id, w.treinador || null]), p: (__t.store.tprotos || []).map(p => p.id) }));
    expect(st.w, 'o treino do próprio aluno foi apagado; o do treinador volta').toEqual([['tw1', 't1']]);
    expect(st.p).toContain('pt');
  });

  test('a conta de treinador não tem "Ligar a um treinador"', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#tabbar [data-tab="perfil"]');
    await page.waitForTimeout(150);
    expect(await page.isVisible('#pfTreinWrap')).toBe(false);
    expect(await page.isVisible('#pfAlarme'), 'nem o alarme do descanso: ele não treina').toBe(false);
  });
});
