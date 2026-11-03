/* O Pessoal do treinador (#104).

   O relato: "Quando eu coloquei minha conta como treinador, sumiu o meu
   pessoal, coloque um novo botão escrito 'PESSOAL' e lá conter o usuário do
   treinador". O dono escolheu "a barra muda": nos alunos, Alunos, Pessoal e
   Perfil; no Pessoal, a barra de sempre, com Alunos na ponta.

   O que pode dar errado, e cada teste confere uma coisa:
   - o lado pessoal não abrir, ou abrir e não ter como voltar aos alunos;
   - o protocolo do treinador ir para o plano de um aluno (o carimbo do
     save() põe o aluno aberto em tudo que não tem dono);
   - o protocolo de um aluno aparecer no Pessoal, ou o do Pessoal no aluno;
   - o protocolo do aluno herdar o id de um protocolo do Pessoal pelo
     histórico (protOrfao), misturando os dois;
   - a barra de seis lugares não caber em 320 px. */

const { test, expect } = require('@playwright/test');
const { diaISO, URL_HTTP, servirPorHttp, isolarRede, coletarErros, preencherSerie } = require('./app');

/** Semeia antes do app, como em treinador.spec.js (a página vazia, ouvindo
    o vínculo, gravaria o store vazio por cima do semeado). Pelo http falso
    de tests/app.js: sob file://, a página recarregada às vezes acha o
    armazenamento vazio, e o teste do lado lembrado falhava (2 em 4 repetições). */
async function abrirApp(page, storage) {
  await isolarRede(page.context());
  await servirPorHttp(page.context());
  const erros = coletarErros(page);
  await page.addInitScript(s => {
    if (localStorage.getItem('__semeado')) return;
    localStorage.clear();
    for (const k in s) localStorage.setItem(k, s[k]);
    localStorage.setItem('__semeado', '1');
  }, storage);
  await page.goto(URL_HTTP);
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return erros;
}

const supino = { n: 'Supino reto', s: 3, rest: 90, g: 'peito', sec: [] };
/** Conta que virou de treinador (#103): o que era dela ganhou `pessoal`. */
function estadoTreinador(extra = {}) {
  const store = {
    getd: 2600, days: { [diaISO(0)]: [{ meal: 'Almoço', items: [{ n: 'Arroz', q: 100, kcal: 130, p: 2.5, c: 28, g: 0.3 }] }] },
    custom: [], liquids: {}, protocol: [], weights: [{ d: diaISO(3), w: 82 }], passos: {},
    goals: { nome: 'Carla', pesoAtual: 82, pesoAlvo: 76, meses: 4, tIntro: true, sexo: 'F', idade: 34, altura: 168, ativ: 1.5, obj: 'cutting' },
    tdays: { [diaISO(2)]: [{ id: 's1', name: 'Meu A', min: 50, kcal: 300, vol: 1800, tid: 'mw1', prot: 'mp1', protNome: 'Meu treino', ex: [{ n: 'Supino reto', sets: [{ kg: 40, rep: 10 }] }] }] },
    tprotos: [{ id: 'mp1', nome: 'Meu treino', pessoal: true }, { id: 'ap1', nome: 'Força da Ana', aluno: 'a1' }],
    tprotocol: [
      { id: 'mw1', nome: 'Meu A', cat: 'A', prot: 'mp1', protNome: 'Meu treino', pessoal: true, ex: [supino] },
      { id: 'aw1', nome: 'Ana A', cat: 'A', prot: 'ap1', protNome: 'Força da Ana', aluno: 'a1', ex: [{ n: 'Agachamento livre', s: 4, rest: 120, g: 'quadriceps', sec: [] }] },
    ],
    papel: 'treinador', convite: 'ABC234', ...extra,
  };
  return { 'cutting.v1': JSON.stringify(store), 'cutting.owner': 'u1' };
}
const vinc = (aluno, nome) => ({ treinador: 'u1', treinadorNome: 'Carla', aluno, alunoNome: nome, codigo: 'ABC234', desde: 1, pesos: false });
const docsTreinador = () => ({
  'convites/ABC234': { treinador: 'u1', nome: 'Carla', criado: 1 },
  'vinculos/a1': vinc('a1', 'Ana'),
  'vinculos/a2': vinc('a2', 'Bruno'),
});
const comDocs = (estado, docs) => ({ ...estado, __docs: JSON.stringify(docs) });
const docs = page => page.evaluate(() => JSON.parse(localStorage.getItem('__docs') || '{}'));
const viewOn = page => page.evaluate(() => document.querySelector('.view.on')?.id);
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const abas = page => page.evaluate(() => [...document.querySelectorAll('#tabbar button')]
  .filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim() || '+'));
const acesa = page => page.evaluate(() => [...document.querySelectorAll('#tabbar button.on')]
  .filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim()));
const preencher = (page, d) => page.evaluate(dados => {
  for (const [id, v] of Object.entries(dados)) {
    const c = document.getElementById(id);
    c.value = v; c.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, d);
const abrirAluno = async (page, uid) => {
  await clicar(page, `[data-aluno="${uid}"]`);
  await page.waitForSelector('#view-aluno.on');
  await page.waitForTimeout(150);
};
/** Protocolo novo pelo pop-up, e um treino nele (a tela do aluno e a aba
    Treino abrem o mesmo pop-up). */
async function novoProtocolo(page, botao, nome, treino, exercicio) {
  await clicar(page, botao);
  await page.waitForSelector('#protNovoOverlay.open');
  await preencher(page, { protNovoNome: nome });
  await clicar(page, '#protNovoOk');
  await page.waitForSelector('#tprotoOverlay.open');
  await clicar(page, '#tpNew');
  await page.waitForSelector('#tpEditOverlay.open');
  await preencher(page, { tpName: treino, tpExName: exercicio, tpExS: '3' });
  await clicar(page, '#tpExAdd');
  await clicar(page, '#tpSave');
  await page.waitForTimeout(150);
  await clicar(page, '#tpClose');
  await page.waitForTimeout(150);
}

test.describe('O Pessoal do treinador', () => {

  test('a barra: Alunos, Pessoal e Perfil; no Pessoal, a de sempre com Alunos na ponta, e o Alunos volta', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    expect(await viewOn(page)).toBe('view-alunos');
    expect(await abas(page)).toEqual(['Alunos', 'Pessoal', 'Perfil']);

    await clicar(page, '#tabbar [data-tab="pessoal"]');
    expect(await viewOn(page)).toBe('view-inicio');
    expect(await abas(page)).toEqual(['Alunos', 'Início', 'Comida', '+', 'Treino', 'Perfil']);
    expect(await acesa(page)).toEqual(['Início']);
    // é o Início dela: o nome, o treino feito e a comida de hoje
    expect(await page.textContent('#view-inicio')).toContain('Meu A');

    await clicar(page, '#tabbar [data-tab="food"]');
    expect(await viewOn(page)).toBe('view-food');
    await clicar(page, '#tabbar [data-tab="treino"]');
    expect(await viewOn(page)).toBe('view-treino');
    // o Perfil é dos dois lados: fica com a barra de onde veio
    await clicar(page, '#tabbar [data-tab="perfil"]');
    expect(await abas(page)).toEqual(['Alunos', 'Início', 'Comida', '+', 'Treino', 'Perfil']);
    expect(await page.isVisible('.pfgoal'), 'o objetivo é do Pessoal').toBe(true);

    await clicar(page, '#tabbar [data-tab="alunos"]');
    expect(await viewOn(page)).toBe('view-alunos');
    expect(await abas(page)).toEqual(['Alunos', 'Pessoal', 'Perfil']);
    await clicar(page, '#tabbar [data-tab="perfil"]');
    expect(await abas(page)).toEqual(['Alunos', 'Pessoal', 'Perfil']);
    expect(erros).toEqual([]);
  });

  test('o app abre no último lado usado neste aparelho, e o de outra conta não vale', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#tabbar [data-tab="pessoal"]');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('tresults.lado')))).toEqual({ uid: 'u1', e: 'pessoal' });
    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await page.waitForTimeout(500);
    expect(await viewOn(page)).toBe('view-inicio');
    expect(await abas(page)).toEqual(['Alunos', 'Início', 'Comida', '+', 'Treino', 'Perfil']);

    await clicar(page, '#tabbar [data-tab="alunos"]');
    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await page.waitForTimeout(500);
    expect(await viewOn(page)).toBe('view-alunos');

    // a lembrança de outra conta não decide nada
    await page.evaluate(() => localStorage.setItem('tresults.lado', JSON.stringify({ uid: 'outra', e: 'pessoal' })));
    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await page.waitForTimeout(500);
    expect(await viewOn(page)).toBe('view-alunos');
  });

  test('o que é do Pessoal fica no Pessoal, e o que é do aluno fica no aluno', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForTimeout(200);
    expect(await page.textContent('#tprotoCards')).toContain('Meu A');
    expect(await page.textContent('#view-treino'), 'nada da Ana no Pessoal').not.toContain('Ana A');
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome))).toEqual(['Meu treino']);
    // no Pessoal, o pop-up e as sugestões são os de quem treina
    await clicar(page, '#tOpenProtocol');
    await page.waitForSelector('#tprotoOverlay.open');
    expect(await page.isVisible('#tpProtDel'), 'com um protocolo só, não se exclui, como em qualquer conta').toBe(false);
    await clicar(page, '#tpClose');
    await clicar(page, '#tSugBtn');
    await page.waitForTimeout(150);
    expect(await page.textContent('#tSugSub'), 'a sugestão fala do objetivo dela').toContain('cutting');
    await page.evaluate(() => document.getElementById('tSugOverlay')?.classList.remove('open'));

    await clicar(page, '#tabbar [data-tab="alunos"]');
    await abrirAluno(page, 'a1');
    const al = await page.textContent('#alProts');
    expect(al).toContain('Força da Ana');
    expect(al, 'nada do Pessoal na Ana').not.toContain('Meu treino');
    expect(erros).toEqual([]);
  });

  test('protocolo e treino criados no Pessoal são dele: nunca vão para o plano de um aluno', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoTreinador({ tprotos: [], tprotocol: [], tdays: {} }), docsTreinador()));
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForTimeout(200);
    await novoProtocolo(page, '#protNovo', 'Meu cutting', 'Pernas', 'Leg press');
    let st = await page.evaluate(() => ({ p: __t.store.tprotos, w: __t.store.tprotocol }));
    expect(st.p).toEqual([expect.objectContaining({ nome: 'Meu cutting', pessoal: true })]);
    expect(st.w).toEqual([expect.objectContaining({ nome: 'Pernas', pessoal: true })]);
    expect(st.p[0].aluno).toBeUndefined();

    // a sugestão pronta também
    await page.evaluate(() => __t.useTSug(__t.T_SUG[0].id, null));
    await page.waitForTimeout(100);
    st = await page.evaluate(() => ({ p: __t.store.tprotos, w: __t.store.tprotocol }));
    expect(st.p.every(p => p.pessoal && !p.aluno)).toBe(true);
    expect(st.w.every(w => w.pessoal && !w.aluno)).toBe(true);

    // agora o aluno: o carimbo do save() não leva nada do Pessoal
    await clicar(page, '#tabbar [data-tab="alunos"]');
    await abrirAluno(page, 'a1');
    expect(await page.textContent('#alProts')).toContain('Nenhum protocolo ainda');
    await novoProtocolo(page, '#alProtNovo', 'Força', 'A', 'Agachamento livre');
    st = await page.evaluate(() => ({ p: __t.store.tprotos, w: __t.store.tprotocol }));
    expect(st.p.filter(p => p.aluno === 'a1').map(p => p.nome)).toEqual(['Força']);
    expect(st.w.filter(w => w.aluno === 'a1').map(w => w.nome)).toEqual(['A']);
    expect(st.p.filter(p => p.pessoal).every(p => !p.aluno)).toBe(true);
    expect(st.w.filter(w => w.pessoal).every(w => !w.aluno)).toBe(true);

    await page.evaluate(() => __t.publicarPlanos());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('__docs'))['planos/a1'], null, { timeout: 5000 });
    const plano = (await docs(page))['planos/a1'];
    expect(plano.tprotos.map(p => p.nome)).toEqual(['Força']);
    expect(plano.tprotocol.map(w => w.nome)).toEqual(['A']);
    expect(erros).toEqual([]);
  });

  test('o mesmo nome no Pessoal e no aluno são dois protocolos, e o do aluno não herda o id do histórico do treinador', async ({ page }) => {
    // "Antigo": um protocolo do Pessoal que foi excluído, e ficou no histórico
    const est = estadoTreinador({
      tprotos: [], tprotocol: [],
      tdays: { [diaISO(5)]: [{ id: 's9', name: 'X', min: 40, prot: 'px', protNome: 'Antigo', ex: [{ n: 'Supino reto', sets: [{ kg: 30, rep: 10 }] }] }] },
    });
    const erros = await abrirApp(page, comDocs(est, docsTreinador()));
    await clicar(page, '#tabbar [data-tab="alunos"]');
    await abrirAluno(page, 'a1');
    await novoProtocolo(page, '#alProtNovo', 'Antigo', 'A', 'Agachamento livre');
    let p = await page.evaluate(() => __t.store.tprotos);
    expect(p).toHaveLength(1);
    expect(p[0].id, 'o id do histórico é do Pessoal').not.toBe('px');

    // no Pessoal, o mesmo nome é aceito, e devolve o id do histórico dele
    await clicar(page, '#tabbar [data-tab="pessoal"]');
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForTimeout(200);
    await novoProtocolo(page, '#protNovo', 'Antigo', 'Peito', 'Supino reto');
    p = await page.evaluate(() => __t.store.tprotos);
    expect(p.map(x => [x.nome, x.id === 'px', !!x.pessoal, x.aluno || ''])).toEqual(
      expect.arrayContaining([['Antigo', true, true, ''], ['Antigo', false, false, 'a1']]));
    expect(await page.evaluate(() => __t.listaProtocolos().map(x => x.nome))).toEqual(['Antigo']);
    expect(erros).toEqual([]);
  });

  test('materializar a lista no Pessoal não apaga os protocolos dos alunos', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.evaluate(() => { __t.materializarProtocolos(); __t.salvar(); });
    const p = await page.evaluate(() => __t.store.tprotos.map(x => [x.id, x.aluno || '']));
    expect(p).toEqual([['mp1', ''], ['ap1', 'a1']]);
  });

  test('as academias contam só os treinos do Pessoal', async ({ page }) => {
    const est = estadoTreinador({ academias: [{ id: 'g1', nome: 'Smart' }] });
    const s = JSON.parse(est['cutting.v1']);
    s.tprotocol.forEach(w => { w.acads = ['g1']; });   // o do aluno também, como a sugestão o deixava
    est['cutting.v1'] = JSON.stringify(s);
    await abrirApp(page, comDocs(est, docsTreinador()));
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => __t.acadResumo('g1'))).toBe('1 treino');
  });

  test('o treino em andamento no Pessoal volta ao reabrir, mesmo com o lado lembrado nos alunos', async ({ page }) => {
    const erros = await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    await clicar(page, '#tabbar [data-tab="treino"]');
    await page.waitForSelector('#tprotoCards [data-tw="mw1"]');
    await clicar(page, '#tprotoCards [data-tw="mw1"]');
    await page.waitForSelector('#trSets .tr-set');
    await preencherSerie(page, 0, 42.5, 10, 2);
    // o app descartado no meio do treino
    await page.evaluate(() => localStorage.setItem('tresults.lado', JSON.stringify({ uid: 'u1', e: 'alunos' })));
    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => !!__t.trS), 'o treino volta, mesmo com o lado lembrado nos alunos').toBe(true);
    expect(await viewOn(page)).toBe('view-treino');
    expect(await page.evaluate(() => __t.trS.w.id)).toBe('mw1');
    expect(erros).toEqual([]);
  });

  test('o pop-up do código de professor e a nota do cadastro falam do Pessoal', async ({ page }) => {
    await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
    const t = await page.evaluate(() => ({ prof: document.querySelector('#profOverlay .vinc-nao').textContent, cad: document.getElementById('cadPapelNota').textContent }));
    expect(t.prof).toContain('botão Pessoal');
    expect(t.cad).toContain('botão Pessoal');
    expect(t.cad).not.toContain('use outra conta');
  });

  for (const largura of [320, 390]) {
    test(`a barra do Pessoal cabe em ${largura} px, sem cortar nome nenhum`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await abrirApp(page, comDocs(estadoTreinador(), docsTreinador()));
      for (const lado of ['alunos', 'pessoal']) {
        await clicar(page, `#tabbar [data-tab="${lado}"]`);
        await page.waitForTimeout(150);
        const m = await page.evaluate(() => {
          const bar = document.getElementById('tabbar');
          const bs = [...bar.querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none');
          return {
            larg: document.documentElement.scrollWidth,
            sai: bs.filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5; }).map(b => b.textContent.trim()),
            cortado: bs.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()),
            sobre: bs.some((b, i) => i && b.getBoundingClientRect().left < bs[i - 1].getBoundingClientRect().right - 0.5),
          };
        });
        expect(m.larg, `sem rolagem de lado (${lado})`).toBeLessThanOrEqual(largura);
        expect(m.sai, `nenhum botão fora da tela (${lado})`).toEqual([]);
        expect(m.cortado, `nenhum nome cortado (${lado})`).toEqual([]);
        expect(m.sobre, `nenhum botão por cima do outro (${lado})`).toBe(false);
      }
    });
  }
});
