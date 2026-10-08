/* Sincronização com a nuvem.

   O documento é gravado INTEIRO, sem merge: quem grava por último ganha, e o
   que ele não mandou deixa de existir. Por isso três regras, cada uma com
   teste aqui:
   - só herda do aparelho quem é dono dele (outra conta no mesmo celular não
     leva o exógeno, as academias nem o treino em andamento da anterior);
   - campo ausente não é lista vazia (aparelho com versão anterior não apaga
     o que ele não conhece), e quem não sabe não envia;
   - o que veio de uma versão mais nova volta como chegou. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

/** Documento de outra conta, como a nuvem devolveria. */
const docOutra = (extra = {}) => ({
  getd: 2500, days: {}, custom: [], liquids: {}, protocol: [], weights: [], tdays: {}, passos: {},
  goals: { nome: 'Bia', pesoAtual: 60, sexo: 'F', idade: 28, altura: 165, ativ: 1.4, obj: 'cutting', tIntro: true },
  tprotocol: [{ id: 'wb', nome: 'Treino da Bia', cat: 'A', ex: [{ n: 'Agachamento', s: 3, rest: 90, g: 'quadriceps', sec: [] }] }],
  ...extra,
});

const capturarGravacoes = page => page.evaluate(() => {
  window.__pushes = [];
  window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); };
});
const ultimaGravacao = async page => {
  await page.evaluate(() => window.__t.pushRemote());
  await page.waitForTimeout(80);
  return page.evaluate(() => window.__pushes.at(-1));
};

test.describe('Nuvem', () => {

  test('outra conta no mesmo celular não herda o exógeno', async ({ page }) => {
    /* Dado de saúde (LGPD). Ele fica só no aparelho por padrão, e o que fica
       no aparelho é do DONO do aparelho — não de quem entrar depois. */
    const st = estadoBase();
    const s = JSON.parse(st['cutting.v1']);
    Object.assign(s.goals, { exog: ['clen'], clenDose: 80, exogAceite: '2026-09-22T12:00:00.000Z', exogLocal: true });
    await abrirApp(page, { ...st, 'cutting.v1': JSON.stringify(s) });

    await page.evaluate(d => { __t.setUser({ uid: 'u2' }); __t.applyRemote(d); }, docOutra());
    const g = await page.evaluate(() => __t.store.goals);
    expect(g.nome).toBe('Bia');
    expect(g.exog, 'o clembuterol da conta anterior não pode passar para esta').toBeUndefined();
    expect(g.clenDose).toBeUndefined();
    expect(g.exogAceite).toBeUndefined();
  });

  test('outra conta não herda academias nem o histórico de líquidos quando o documento dela não tem o campo', async ({ page }) => {
    await abrirApp(page, estadoBase({
      academias: [{ id: 'a1', nome: 'Smart Fit' }],
      liqLog: { [diaISO(0)]: [{ id: 'l1', ml: 500, t: '08:00' }] },
    }));
    await page.evaluate(d => { __t.setUser({ uid: 'u2' }); __t.applyRemote(d); }, docOutra());
    const s = await page.evaluate(() => ({ a: __t.store.academias, l: __t.store.liqLog }));
    expect(s.a).toBeUndefined();
    expect(s.l).toBeUndefined();
  });

  test('trocar de conta limpa a academia escolhida e descarta o treino em andamento', async ({ page }) => {
    await abrirApp(page, {
      ...estadoBase({ academias: [{ id: 'a1', nome: 'Smart Fit' }] }),
      'tresults.acad': 'a1',
    });
    // um treino da conta u1 em andamento
    await page.evaluate(() => localStorage.setItem('tresults.run', JSON.stringify({
      w: { id: 'w1', nome: 'Treino A', ex: [{ n: 'Supino reto', s: 2, rest: 90, g: 'peito' }] },
      start: Date.now() - 60000, idx: 0, logs: [], at: Date.now(),
    })));
    await page.evaluate(d => {
      window.__fb.getDoc = async () => ({ exists: () => true, data: () => d });
      __t.setUser({ uid: 'u2' });
      return __t.startSync();
    }, docOutra());
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      run: localStorage.getItem('tresults.run'),
      acad: localStorage.getItem('tresults.acad'),
      dono: localStorage.getItem('cutting.owner'),
      nome: __t.store.goals.nome,
      treinos: __t.store.tprotocol.map(w => w.nome),
    }));
    expect(r.run).toBeNull();
    expect(r.acad).toBeNull();
    expect(r.dono).toBe('u2');
    expect(r.nome).toBe('Bia');
    expect(r.treinos).toEqual(['Treino da Bia']);
  });

  test('o treino em andamento só reabre para a conta dona do aparelho', async ({ page }) => {
    /* O login é confirmado antes da nuvem responder, e o treino é retomado
       nessa hora, sem esperar a rede. Se o aparelho é de outra conta, ele
       não pode nem aparecer. */
    await page.addInitScript(() => {
      window.__abriuTreino = false;
      new MutationObserver(() => {
        const o = document.getElementById('tRunOverlay');
        if (o && o.classList.contains('open')) window.__abriuTreino = true;
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    const st = estadoBase();
    await abrirApp(page, {
      ...st,
      'cutting.owner': 'u0',   // o aparelho era de outra conta; quem entra é u1
      'tresults.run': JSON.stringify({
        w: { id: 'w1', nome: 'Treino A', ex: [{ n: 'Supino reto', s: 2, rest: 90, g: 'peito' }] },
        start: Date.now() - 60000, idx: 0, logs: [], at: Date.now(),
      }),
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__abriuTreino)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('tresults.run'))).toBeNull();
  });

  test('aparelho que nunca recebeu academias não sobe lista vazia por cima', async ({ page }) => {
    await abrirApp(page, estadoBase());   // sem o campo academias
    await capturarGravacoes(page);
    await page.evaluate(d => __t.applyRemote(d), docOutra({ goals: { nome: 'Pedro', tIntro: true } }));
    const d = await ultimaGravacao(page);
    expect('academias' in d, 'quem não sabe não envia').toBe(false);
  });

  test('campo de uma versão mais nova volta para a nuvem como chegou, e sobrevive a reabrir', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await capturarGravacoes(page);
    await page.evaluate(d => __t.applyRemote(d), docOutra({
      goals: { nome: 'Pedro', tIntro: true }, novidade: { a: 1, lista: [1, 2] },
    }));
    expect((await ultimaGravacao(page)).novidade).toEqual({ a: 1, lista: [1, 2] });

    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await capturarGravacoes(page);
    expect((await ultimaGravacao(page)).novidade).toEqual({ a: 1, lista: [1, 2] });
  });

  test('editar um treino mantém o campo que esta versão não conhece', async ({ page }) => {
    const st = estadoBase();
    const s = JSON.parse(st['cutting.v1']);
    s.tprotocol[0].futuro = { x: 1 };
    await abrirApp(page, { ...st, 'cutting.v1': JSON.stringify(s) });
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w1"]').click());
    await page.waitForSelector('#tpEditOverlay.open');
    await page.fill('#tpName', 'Treino A (novo nome)');
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => __t.store.tprotocol[0]);
    expect(w.nome).toBe('Treino A (novo nome)');
    expect(w.futuro).toEqual({ x: 1 });
  });

  test('o histórico de líquidos sobe para a nuvem e não some quando a nuvem responde', async ({ page }) => {
    /* Ele não subia, e o store remontado pela nuvem o apagava a cada
       abertura do app: a lista de horários voltava a "Lançado antes de
       existir histórico". */
    const hoje = diaISO(0);
    await abrirApp(page, estadoBase({
      liquids: { [hoje]: 500 },
      liqLog: { [hoje]: [{ id: 'l1', ml: 500, t: '08:00' }] },
    }));
    await capturarGravacoes(page);
    expect((await ultimaGravacao(page)).liqLog).toEqual({ [hoje]: [{ id: 'l1', ml: 500, t: '08:00' }] });

    // documento gravado por versão anterior, sem o campo: o daqui fica
    await page.evaluate(d => __t.applyRemote(d), docOutra({ goals: { nome: 'Pedro', tIntro: true }, liquids: { [hoje]: 500 } }));
    expect(await page.evaluate(() => __t.store.liqLog)).toEqual({ [hoje]: [{ id: 'l1', ml: 500, t: '08:00' }] });

    // com o campo, vale o da nuvem
    await page.evaluate(([d, h]) => __t.applyRemote({ ...d, liqLog: { [h]: [{ id: 'l9', ml: 300, t: '10:00' }] } }),
      [docOutra({ goals: { nome: 'Pedro', tIntro: true } }), hoje]);
    expect(await page.evaluate(h => __t.store.liqLog[h].map(x => x.id), hoje)).toEqual(['l9']);
  });

  test('a mesma conta continua guardando o que é dela no aparelho', async ({ page }) => {
    /* A trava de dono não pode virar perda para quem é dono. */
    await abrirApp(page, estadoBase({ academias: [{ id: 'a1', nome: 'Smart Fit' }] }));
    await page.evaluate(d => __t.applyRemote(d), docOutra({ goals: { nome: 'Pedro', tIntro: true } }));
    expect(await page.evaluate(() => __t.store.academias.map(a => a.id))).toEqual(['a1']);
  });
});
