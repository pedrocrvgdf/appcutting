/* O peso do corpo é a carga (#91).

   O pedido: "Exercícios em que usa o peso corporal como ABDOMINAL, PRANCHA,
   PARALELA LIVRE, BARRA FIXA e etc, o app deve entender que o peso já é o do
   corpo (use a ciência para entender como é feito no abdominal essa
   distribuição) e que o peso que deve aparecer é para adicionar. Para fins de
   resguardo o usuário pode identificar quando o exercício é com o próprio
   peso corporal."

   Os riscos: contar o corpo duas vezes (o próprio peso digitado no campo de
   carga), reescrever o histórico (o selo e o volume de uma sessão antiga
   mudarem sem treino novo), o selo acusar "queda" de quem só emagreceu, e
   número inventado onde não há medida. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO, iniciarTreino, preencherSerie } = require('./app');

const hoje = diaISO(0), ontem = diaISO(1);
const ex = (n, g = 'costas', extra = {}) => ({ n, s: 2, rest: 60, g, sec: [], ...extra });
const comTreino = (exs, extra = {}) => estadoBase({ tprotocol: [{ id: 'w1', nome: 'Treino A', cat: 'A', ex: exs }], ...extra });
const semPeso = e => { const st = JSON.parse(e['cutting.v1']); st.goals.pesoAtual = 0; e['cutting.v1'] = JSON.stringify(st); return e; };
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const serie = i => `#trSets .tr-set[data-i="${i}"]`;
const proximo = async page => { await clicar(page, '#trNext'); await page.waitForTimeout(350); };
const nota = page => page.evaluate(() => (document.querySelector('#trSets .tr-corpo') || {}).textContent || '');
const sessaoHoje = page => page.evaluate(h => __t.store.tdays[h][0], hoje);
const ses = (id, extra) => ({ id, name: 'Treino A', tid: 'w1', min: 30, kcal: 150, ...extra });

test.describe('O peso do corpo é a carga', () => {

  test('a fração de cada movimento, com fonte; sem medida, nada', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => {
      const f = (n, sx = 'M') => { const x = __t.fracaoCorpo(n, sx); return x ? x.f : null; };
      return {
        barra: f('Barra fixa'), supinada: f('Barra fixa pegada supinada'), chin: f('Chin up'), colete: f('Barra fixa com colete'),
        paralela: f('Paralela livre'), tricepsParalela: f('Tríceps paralela'), mergulho: f('Mergulho'), mergulhoBanco: f('Mergulho no banco'), tricepsBanco: f('Tríceps banco'),
        flexao: f('Flexão de braço'), diamante: f('Flexão diamante'), fechada: f('Flexão com pegada fechada'), joelhos: f('Flexão com joelhos apoiados'),
        declinada: f('Flexão declinada'), inclinada: f('Flexão inclinada no banco'), umaMao: f('Flexão com uma mão'), nordica: f('Flexão nórdica'),
        abdM: f('Abdominal'), abdF: f('Abdominal', 'F'), supra: f('Abdominal supra'), completoM: f('Abdominal completo'), completoF: f('Abdominal completo', 'F'),
        infra: f('Abdominal infra'), remador: f('Abdominal remador'), roda: f('Abdominal na roda'), elevacao: f('Elevação de pernas'), elevParalela: f('Elevação de joelho na paralela'),
        assistida: f('Barra fixa assistida'), elastico: f('Barra fixa com elástico'), burpee: f('Burpee'), prancha: f('Prancha'),
        /* da revisão: pendurado não é barra, banco não é paralela, pegada não
           é paralela, "flexão de" outra coisa não é flexão de braço */
        infraBarra: f('Abdominal infra na barra fixa'), infraParalela: f('Infra na paralela'), abdParalela: f('Abdominal na paralela'),
        joelhoPeitoBarra: f('Joelho no peito na barra fixa'), dipsBanco: f('Dips no banco'), benchDips: f('Bench dips'),
        mergulhoCadeiras: f('Mergulho entre cadeiras'), pulley: f('Pulley frente paralela'), flexaoPernas: f('Flexão de pernas'),
        flexaoTronco: f('Flexão de tronco'), flexaoQuadril: f('Flexão de quadril'), flexaoJoelhosApoiados: f('Flexão de joelhos apoiados'),
        rodinha: f('Abdominal na rodinha'), emV: f('Abdominal em V'), australiana: f('Barra fixa australiana'), suspensao: f('Suspensão na barra fixa'),
        flexaoTrx: f('Flexão no TRX'), flexaoPike: f('Flexão pike'), flexaoCadeira: f('Flexão com os pés na cadeira'),
        abdLateralHalter: f('Abdominal lateral com halter'), crunch: f('Crunch com anilha'), sitUp: f('Sit up'), supra2: f('Supra abdominal'),
        barraPronada: f('Barra pronada'), paralelaAssistida: f('Paralela assistida'),
        contraBarra: !!(__t.fracaoCorpo('Barra fixa assistida', 'M') || {}).contra, contraGraviton: !!(__t.fracaoCorpo('Barra graviton', 'M') || {}).contra,
        modelo: !!__t.fracaoCorpo('Abdominal', 'M').modelo, barraModelo: !!__t.fracaoCorpo('Barra fixa', 'M').modelo,
      };
    });
    expect(r).toEqual({
      barra: 1, supinada: 1, chin: 1, colete: 1,
      paralela: 1, tricepsParalela: 1, mergulho: 1, mergulhoBanco: null, tricepsBanco: null,
      flexao: 0.664, diamante: 0.664, fechada: 0.664, joelhos: 0.529,
      declinada: null, inclinada: null, umaMao: null, nordica: null,
      abdM: 0.33, abdF: 0.31, supra: 0.33, completoM: 0.6, completoF: 0.58,
      infra: null, remador: null, roda: null, elevacao: null, elevParalela: null,
      assistida: 1, elastico: null, burpee: null, prancha: null,
      infraBarra: null, infraParalela: null, abdParalela: null,
      joelhoPeitoBarra: null, dipsBanco: null, benchDips: null,
      mergulhoCadeiras: null, pulley: null, flexaoPernas: null,
      flexaoTronco: null, flexaoQuadril: null, flexaoJoelhosApoiados: 0.529,
      rodinha: null, emV: null, australiana: null, suspensao: null,
      flexaoTrx: null, flexaoPike: null, flexaoCadeira: null,
      abdLateralHalter: null, crunch: 0.33, sitUp: 0.6, supra2: 0.33,
      barraPronada: 1, paralelaAssistida: 1,
      contraBarra: true, contraGraviton: true,
      modelo: true, barraModelo: false,
    });
    // a tabela de segmentos de de Leva soma o corpo inteiro (com dois braços e duas pernas)
    const soma = await page.evaluate(() => {
      const S = __t.PC_SEG;
      return ['M', 'F'].map(k => Math.round(S[k].cab + S[k].tronco + 2 * (S[k].braco + S[k].antebraco + S[k].mao)));
    });
    expect(soma).toEqual([60, 58]);
  });

  test('barra fixa: o corpo inteiro conta, o campo é o acrescentado, e a sessão grava o peso do dia', async ({ page }) => {
    const erros = await abrirApp(page, comTreino([ex('Barra fixa')]));
    await iniciarTreino(page);
    expect(await nota(page)).toBe('Seu peso já conta: 80 kg em cada repetição (o corpo inteiro, 80 kg). A carga é só o que você acrescenta.');
    await clicar(page, '#trMaisCarga');
    const campo = await page.evaluate(s => {
      const f = document.querySelector(s + ' .fkg');
      return { mais: f.classList.contains('acresc'), rotulo: f.querySelector('input').getAttribute('aria-label') };
    }, serie(0));
    expect(campo).toEqual({ mais: true, rotulo: 'Carga acrescentada, série 1' });
    await preencherSerie(page, 0, 10, 8);
    await preencherSerie(page, 1, undefined, 6);
    await proximo(page);
    const s = await sessaoHoje(page);
    expect([s.pesoDia, s.ex[0].corpoKg]).toEqual([80, 80]);
    expect(s.ex[0].sets.map(x => [x.kg, x.rep]), 'no histórico, a carga é a acrescentada').toEqual([[10, 8], [0, 6]]);
    expect(s.vol).toBe((80 + 10) * 8 + 80 * 6);
    expect(erros).toEqual([]);
  });

  test('o peso é o da pesagem do dia, e uma pesagem nova não reescreve a sessão', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Paralela livre', 'triceps')], { weights: [{ d: ontem, w: 78.4 }] }));
    await iniciarTreino(page);
    expect(await nota(page)).toMatch(/78,4 kg/);
    await preencherSerie(page, 0, undefined, 10);
    await proximo(page);
    await page.evaluate(h => { __t.store.weights.push({ d: h, w: 90 }); __t.salvar(); }, hoje);
    const s = await sessaoHoje(page);
    expect([s.pesoDia, s.ex[0].corpoKg, s.vol]).toEqual([78.4, 78.4, 784]);
  });

  test('abdominal: estimativa pela massa da cabeça, braços e tronco de cima, por sexo', async ({ page }) => {
    const e = comTreino([ex('Abdominal', 'abdomen')]);
    const st = JSON.parse(e['cutting.v1']); st.goals.sexo = 'F'; st.goals.pesoAtual = 60; e['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, e);
    await iniciarTreino(page);
    expect(await nota(page)).toBe('Seu peso já conta: ≈ 18,6 kg em cada repetição (estimativa, 31% dos seus 60 kg: cabeça, braços e tronco de cima). A carga é só o que você acrescenta.');
    await preencherSerie(page, 0, undefined, 20);
    await proximo(page);
    const s = await sessaoHoje(page);
    expect([s.ex[0].corpoKg, s.vol]).toEqual([18.6, Math.round(18.6 * 20)]);
    // modelo, não medida: entra no volume, mas não no 1RM
    expect(await page.evaluate(() => Object.keys(__t.evoData()))).toEqual([]);
  });

  test('flexão: 66% do peso nas mãos; prancha conta pelo tempo, sem peso no volume', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Flexão diamante', 'peito'), ex('Prancha', 'abdomen')]));
    await iniciarTreino(page);
    expect(await nota(page)).toMatch(/^Seu peso já conta: ≈ 53,1 kg em cada repetição \(66% dos seus 80 kg: o que as mãos sustentam\)/);
    await preencherSerie(page, 0, undefined, 10);
    await proximo(page);
    expect(await nota(page), 'a prancha não tem nota de peso').toBe('');
    expect(await page.evaluate(s => document.querySelector(s + ' .fkg').classList.contains('acresc'), serie(0)), 'o campo da prancha também é acrescentado').toBe(true);
    await page.evaluate(s => { const c = document.querySelector(s + ' .iseg'); c.value = '40'; c.dispatchEvent(new Event('input', { bubbles: true })); }, serie(0));
    await proximo(page);
    const s = await sessaoHoje(page);
    expect([s.ex[0].corpoKg, 'corpoKg' in s.ex[1], s.vol]).toEqual([53.1, false, 531]);
  });

  test('sem fração medida, conta pelas repetições, sem nota, como sempre', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Mergulho no banco', 'triceps')]));
    await iniciarTreino(page);
    expect(await nota(page)).toBe('');
    expect(await page.evaluate(() => !!document.getElementById('trMaisCarga')), 'mas o campo continua sendo o acrescentado').toBe(true);
    await preencherSerie(page, 0, undefined, 12);
    await proximo(page);
    const s = await sessaoHoje(page);
    expect(['corpoKg' in s.ex[0], s.vol, s.pesoDia]).toEqual([false, 0, 80]);
  });

  test('sem peso conhecido, a nota pede o peso, e nada é inventado', async ({ page }) => {
    await abrirApp(page, semPeso(comTreino([ex('Barra fixa')])));
    await iniciarTreino(page);
    expect(await nota(page)).toMatch(/Lance o seu peso/);
    await preencherSerie(page, 0, undefined, 8);
    await proximo(page);
    const s = await sessaoHoje(page);
    expect([s.pesoDia, 'corpoKg' in s.ex[0], s.vol]).toEqual([0, false, 0]);
  });

  test('o próprio peso digitado como carga acrescentada pergunta uma vez; "Corrigir" volta ao campo', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa'), ex('Remada curvada')]));
    await iniciarTreino(page);
    await clicar(page, '#trMaisCarga');
    await preencherSerie(page, 0, 76, 8);
    await preencherSerie(page, 1, 84, 6);
    await clicar(page, '#trNext');
    await page.waitForSelector('#appDlgOverlay.open');
    const d = await page.evaluate(() => ({ t: document.getElementById('appDlgTitle').textContent, m: document.getElementById('appDlgMsg').textContent }));
    expect(d.t).toBe('Carga acrescentada');
    expect(d.m).toMatch(/Série 1 com 76 kg a mais\? Seu peso \(80 kg\) já conta neste exercício/);
    await clicar(page, '#appDlgCancel');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => [__t.trS.idx, document.activeElement && document.activeElement.classList.contains('ikg')])).toEqual([0, true]);
    // "Está certo": não pergunta pela série 2 nem pela vírgula
    await clicar(page, '#trNext');
    await page.waitForSelector('#appDlgOverlay.open');
    await clicar(page, '#appDlgOk');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => [__t.trS.idx, document.getElementById('appDlgOverlay').classList.contains('open')])).toEqual([1, false]);
  });

  test('com referência leve da última vez, a pergunta do peso vem no lugar da da vírgula, uma vez', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa'), ex('Remada curvada')], { tdays: {
      [ontem]: [ses('s1', { pesoDia: 80, vol: 720, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 10, rep: 8 }] }] })],
    } }));
    await iniciarTreino(page);
    await preencherSerie(page, 0, 80, 8);
    await clicar(page, '#trNext');
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgTitle')).toBe('Carga acrescentada');
    await clicar(page, '#appDlgOk');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => [__t.trS.idx, document.getElementById('appDlgOverlay').classList.contains('open')]), 'sem "Conferir a carga" depois').toEqual([1, false]);
  });

  test('carga leve não pergunta, e exercício com carga nunca pergunta pelo peso', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa'), ex('Supino reto', 'peito')]));
    await iniciarTreino(page);
    await clicar(page, '#trMaisCarga');
    await preencherSerie(page, 0, 10, 8);
    await proximo(page);
    expect(await page.evaluate(() => __t.trS.idx)).toBe(1);
    await preencherSerie(page, 0, 80, 8);
    await clicar(page, '#trNext');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open'))).toBe(false);
  });

  test('editor: a escolha segue o nome até a pessoa tocar, e a dela vence o nome', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Supino reto', 'peito')]));
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.waitForTimeout(200);
    await clicar(page, '#tOpenProtocol');
    await page.waitForSelector('#tprotoOverlay.open');
    await clicar(page, '#tprotoList [data-ted="w1"]');
    await page.waitForSelector('#tpEditOverlay.open');
    const sel = () => page.evaluate(() => ({ v: (document.querySelector('#tpExCarga button.on') || {}).dataset.v, nota: document.getElementById('tpExCargaNota').textContent }));
    expect((await sel()).v).toBe('carga');
    await page.fill('#tpExName', 'Barra fixa');
    expect(await sel()).toEqual({ v: 'corpo', nota: 'Seu peso conta em cada repetição: o corpo inteiro. No treino, o campo de carga é só o que você acrescenta.' });
    await page.fill('#tpExName', 'Abdominal supra');
    expect((await sel()).nota).toMatch(/≈ 33% dele \(cabeça, braços e tronco de cima, estimativa/);
    // um nome que o app não reconhece: a pessoa identifica
    await page.fill('#tpExName', 'Agachamento pistol');
    expect((await sel()).v).toBe('carga');
    await clicar(page, '#tpExCarga [data-v="corpo"]');
    expect(await sel()).toEqual({ v: 'corpo', nota: 'Conta pelas repetições: não há medida de quanto do peso este movimento levanta. No treino, o campo de carga é só o que você acrescenta.' });
    await page.fill('#tpExName', 'Agachamento pistol unilateral');
    expect((await sel()).v, 'depois de tocar, mudar o nome não desfaz a escolha').toBe('corpo');
    await clicar(page, '#tpExAdd');
    // e o contrário: "Barra fixa" marcada "Com carga" (a pessoa usa outra coisa com esse nome)
    await page.fill('#tpExName', 'Barra fixa');
    await clicar(page, '#tpExCarga [data-v="carga"]');
    await clicar(page, '#tpExAdd');
    expect(await page.evaluate(() => [...document.querySelectorAll('#tpExList .pm-corpo')].length), 'só o pistol leva a etiqueta').toBe(1);
    await clicar(page, '#tpSave');
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => __t.store.tprotocol[0].ex.map(e => [e.n, e.pesoCorpo]));
    expect(w).toEqual([['Supino reto', undefined], ['Agachamento pistol unilateral', true], ['Barra fixa', false]]);
  });

  test('editar um exercício traz a escolha dele; sem tocar, nada é gravado', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Agachamento pistol', 'quadriceps', { pesoCorpo: true }), ex('Barra fixa')]));
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.waitForTimeout(200);
    await clicar(page, '#tOpenProtocol');
    await page.waitForSelector('#tprotoOverlay.open');
    await clicar(page, '#tprotoList [data-ted="w1"]');
    await page.waitForSelector('#tpEditOverlay.open');
    await page.evaluate(() => document.querySelectorAll('#tpExList .ed[data-ed]')[0].click());
    expect(await page.evaluate(() => document.querySelector('#tpExCarga button.on').dataset.v)).toBe('corpo');
    await clicar(page, '#tpExCarga [data-v="carga"]');
    await clicar(page, '#tpExAdd');
    await page.evaluate(() => document.querySelectorAll('#tpExList .ed[data-ed]')[1].click());
    await page.fill('#tpExS', '4');
    await clicar(page, '#tpExAdd');
    await clicar(page, '#tpSave');
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => __t.store.tprotocol[0].ex.map(e => [e.n, e.s, 'pesoCorpo' in e ? e.pesoCorpo : 'nome']));
    expect(w).toEqual([['Agachamento pistol', 2, false], ['Barra fixa', 4, 'nome']]);
  });

  test('a marcação vale no treino: "Com carga" na barra mostra o kg e não conta o corpo', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa', 'costas', { pesoCorpo: false }), ex('Agachamento pistol', 'quadriceps', { pesoCorpo: true })]));
    await iniciarTreino(page);
    const vis = () => page.evaluate(s => {
      const f = document.querySelector(s + ' .fkg');
      return { kg: !f.classList.contains('oculto'), mais: f.classList.contains('acresc'), botao: !!document.getElementById('trMaisCarga') };
    }, serie(0));
    expect(await vis()).toEqual({ kg: true, mais: false, botao: false });
    expect(await nota(page)).toBe('');
    await preencherSerie(page, 0, 20, 8);
    await proximo(page);
    expect(await vis(), 'pistol: peso do corpo, carga atrás de "+ carga"').toEqual({ kg: false, mais: true, botao: true });
    await preencherSerie(page, 0, undefined, 6);
    await proximo(page);
    const s = await sessaoHoje(page);
    expect(['corpoKg' in s.ex[0], 'corpoKg' in s.ex[1], s.vol]).toEqual([false, false, 160]);
  });

  test('prancha marcada "Com carga": o kg aparece sem o "+" e sem o botão', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Prancha', 'abdomen', { pesoCorpo: false })]));
    await iniciarTreino(page);
    const v = await page.evaluate(s => {
      const f = document.querySelector(s + ' .fkg');
      return { kg: !f.classList.contains('oculto'), mais: f.classList.contains('acresc'), botao: !!document.getElementById('trMaisCarga'), seg: !document.querySelector(s + ' .fseg').classList.contains('oculto') };
    }, serie(0));
    expect(v).toEqual({ kg: true, mais: false, botao: false, seg: true });
  });

  test('trocar o exercício: a marcação era do prescrito, e "Desfazer" a devolve', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa', 'costas', { pesoCorpo: false })]));
    await iniciarTreino(page);
    await clicar(page, '#trTrocar');
    await page.waitForSelector('#trocaOverlay.open');
    await page.fill('#trocaNome', 'Paralela livre');
    await clicar(page, '#trocaOk');
    await page.waitForTimeout(250);
    expect(await nota(page), 'a paralela é peso do corpo, pelo nome').toMatch(/o corpo inteiro/);
    expect(await page.evaluate(() => __t.trS.w.ex[0].pesoCorpo)).toBeUndefined();
    await clicar(page, '#trDesfazer');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => [__t.trS.w.ex[0].n, __t.trS.w.ex[0].pesoCorpo])).toEqual(['Barra fixa', false]);
    expect(await nota(page)).toBe('');
  });

  test('o selo compara com o mesmo peso: emagrecer não é perder carga', async ({ page }) => {
    const barra = (reps, pd) => ({ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: pd, sets: reps.map(rep => ({ kg: 0, rep })) });
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [diaISO(3)]: [ses('s0', { pesoDia: 82, vol: 82 * 20, ex: [barra([10, 10], 82)] })],
      [diaISO(2)]: [ses('s1', { pesoDia: 80, vol: 80 * 20, ex: [barra([10, 10], 80)] })],
      [ontem]: [ses('s2', { pesoDia: 79, vol: 79 * 22, ex: [barra([11, 11], 79)] })],
    } }));
    const selo = id => page.evaluate(id => document.querySelector(`#fdFeed .fd-card[data-fd="${id}"] .fd-prog`).textContent, id);
    expect(await selo('s1'), '2 kg mais leve, as mesmas barras').toBe('mesma carga');
    expect(await selo('s2')).toBe('+10% de carga');
  });

  test('contra uma sessão de antes, compara o que as duas têm; o selo antigo não muda', async ({ page }) => {
    const antiga = (id, reps) => ses(id, { vol: 0, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], sets: reps.map(rep => ({ kg: 0, rep })) }] });
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [diaISO(3)]: [antiga('s0', [10, 8])],
      [diaISO(2)]: [antiga('s1', [10, 10])],
      [ontem]: [ses('s2', { pesoDia: 80, vol: 80 * 24, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 0, rep: 12 }, { kg: 0, rep: 12 }] }] })],
    } }));
    const selo = id => page.evaluate(id => document.querySelector(`#fdFeed .fd-card[data-fd="${id}"] .fd-prog`).textContent, id);
    expect(await selo('s1'), 'as antigas entre si: como antes').toBe('+11% de reps');
    expect(await selo('s2'), 'a nova contra a antiga: em reps, sem "+300%"').toBe('+20% de reps');
  });

  test('barra com lastro: a sessão nova contra a antiga compara o lastro, sem "+900%"', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [diaISO(2)]: [ses('s1', { vol: 160, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], sets: [{ kg: 10, rep: 8 }, { kg: 10, rep: 8 }] }] })],
      [ontem]: [ses('s2', { pesoDia: 80, vol: 1440, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 10, rep: 8 }, { kg: 10, rep: 8 }] }] })],
    } }));
    expect(await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s2"] .fd-prog').textContent)).toBe('mesma carga');
  });

  test('o gráfico de 1RM conta o corpo, também nas sessões de antes, pelo peso daquele dia', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], {
      weights: [{ d: diaISO(10), w: 84 }],
      tdays: {
        [diaISO(5)]: [ses('s0', { vol: 80, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], sets: [{ kg: 10, rep: 8 }] }] })],
        [ontem]: [ses('s1', { pesoDia: 80, vol: 720, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 10, rep: 8 }] }] })],
      },
    }));
    const pts = await page.evaluate(() => __t.evoData()['barra fixa'].pts.map(p => [p.kg, p.ck, Math.round(p.v * 10) / 10]));
    expect(pts).toEqual([[94, 84, Math.round(94 * (1 + 8 / 30) * 10) / 10], [90, 80, 114]]);
    // o selo e o volume gravado da sessão antiga não mudam
    expect(await page.evaluate(d => __t.store.tdays[d][0].vol, diaISO(5))).toBe(80);
  });

  test('a sessão inteira diz quanto o corpo contou, e a carga sai como acrescentada', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [ontem]: [ses('s1', { pesoDia: 80, vol: 720, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 10, rep: 8 }] }] })],
    } }));
    await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] [data-fdver]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    const t = await page.evaluate(() => ({ corpo: document.querySelector('#ssCorpo .ss-corpo').textContent, serie: document.querySelector('#ssCorpo .ss-serie .c').textContent }));
    expect(t).toEqual({ corpo: 'Seu peso contou 80 kg em cada repetição', serie: '+10 kg × 8' });
    // corrigir a série recalcula o volume com o corpo
    await page.evaluate(() => document.querySelector('#ssCorpo .ss-serie').click());
    await page.waitForSelector('#serieOverlay.open');
    await page.fill('#serieRep', '10');
    await clicar(page, '#serieSalvar');
    await page.waitForTimeout(200);
    expect(await page.evaluate(d => __t.store.tdays[d][0].vol, ontem)).toBe(900);
  });

  test('a referência da última vez sai como "+10 kg"', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [ontem]: [ses('s1', { pesoDia: 80, vol: 720, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 10, rep: 8 }, { kg: 0, rep: 6 }] }] })],
    } }));
    await iniciarTreino(page);
    const r = await page.evaluate(() => [...document.querySelectorAll('#trSets .tp-v')].map(e => e.textContent));
    expect(r).toEqual(['+10 kg × 8', '6 reps']);
  });

  test('o volume da semana por grupo conta o corpo', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [hoje]: [ses('s1', { pesoDia: 80, vol: 800, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], corpoKg: 80, sets: [{ kg: 0, rep: 10 }] }] })],
    } }));
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.waitForTimeout(300);
    const kg = await page.evaluate(() => [...document.querySelectorAll('#tVolCard .tvol-row')].map(r => [r.querySelector('.tvl').textContent, r.querySelector('.tvkg').textContent]));
    expect(kg).toContainEqual(['Costas', '800 kg']);
  });

  test('a sessão sobe para a nuvem com o peso do dia e o corpo de cada exercício', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')]));
    await page.evaluate(() => { window.__pushes = []; window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); }; });
    await iniciarTreino(page);
    await preencherSerie(page, 0, undefined, 8);
    await proximo(page);
    await page.evaluate(() => __t.pushRemote());
    await page.waitForTimeout(100);
    const d = await page.evaluate(h => window.__pushes.at(-1).tdays[h][0], hoje);
    expect([d.pesoDia, d.ex[0].corpoKg]).toEqual([80, 80]);
  });

  test('em 320 px a nota e o campo com "+" cabem, sem rolagem de lado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await abrirApp(page, comTreino([ex('Abdominal supra', 'abdomen')], { tdays: {
      [ontem]: [ses('s1', { pesoDia: 80, vol: 0, ex: [{ n: 'Abdominal supra', g: 'abdomen', sec: [], corpoKg: 26.4, sets: [{ kg: 12.5, rep: 20 }, { kg: 12.5, rep: 18 }] }] })],
    } }));
    await iniciarTreino(page);
    const m = await page.evaluate(() => {
      const ov = document.getElementById('tRunOverlay');
      const rows = [...document.querySelectorAll('#trSets .tr-set')].map(r => { const b = r.getBoundingClientRect(); return Math.max(...[...r.querySelectorAll('.tsr1 > *')].map(c => c.getBoundingClientRect().right)) - b.right; });
      /* O campo "+ kg" inteiro, sem o das reps por cima: a classe `.mais`
         (o botão redondo do Início) já o espremeu para 36 px. */
      const kg = document.querySelector('#trSets .tr-set .fkg').getBoundingClientRect(), rep = document.querySelector('#trSets .tr-set .frep').getBoundingClientRect();
      return { rola: document.documentElement.scrollWidth > document.documentElement.clientWidth, ovRola: ov.scrollWidth > ov.clientWidth + 1, sobra: Math.max(...rows), nota: !!document.querySelector('#trSets .tr-corpo'), kgLarg: kg.width, sobrepoe: kg.right > rep.left + 0.5 };
    });
    expect(m.kgLarg).toBeGreaterThanOrEqual(90);
    expect(m.sobrepoe).toBe(false);
    expect(m.rola).toBe(false);
    expect(m.ovRola).toBe(false);
    expect(m.sobra).toBeLessThanOrEqual(0.5);
    expect(m.nota).toBe(true);
  });

  /* ---- Da revisão do #91 ---- */

  test('barra assistida: o campo é o contrapeso, que tira do corpo; menos contrapeso é progresso', async ({ page }) => {
    const sessao = (id, kg, pd) => ses(id, { pesoDia: pd, vol: (pd - kg) * 16, ex: [{ n: 'Barra fixa assistida', g: 'costas', sec: [], tipo: 'corpo', corpoKg: pd, contra: true, sets: [{ kg, rep: 8 }, { kg, rep: 8 }] }] });
    await abrirApp(page, comTreino([ex('Barra fixa assistida')], { tdays: { [diaISO(3)]: [sessao('s0', 30, 80)], [ontem]: [sessao('s1', 20, 80)] } }));
    expect(await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-prog').textContent), '50 kg por rep virou 60').toBe('+20% de carga');
    expect(await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-ex .es').textContent)).toBe('2× · contrapeso de −20 kg');
    expect(await page.evaluate(() => __t.prDe('Barra fixa assistida', '')), 'o contrapeso não é recorde').toBeNull();
    await iniciarTreino(page);
    const v = await page.evaluate(s => {
      const f = document.querySelector(s + ' .fkg');
      return { vis: !f.classList.contains('oculto'), contra: f.classList.contains('contra'), mais: f.classList.contains('acresc'), rot: f.querySelector('input').getAttribute('aria-label'), ref: document.querySelector(s + ' .tp-v').textContent };
    }, serie(0));
    expect(v).toEqual({ vis: true, contra: true, mais: false, rot: 'Contrapeso, série 1', ref: '−20 kg × 8' });
    expect(await nota(page)).toMatch(/Seu peso: 80 kg em cada repetição, menos o contrapeso/);
    await preencherSerie(page, 0, 15, 8);
    expect(await page.evaluate(s => document.querySelector(s + ' .tp-d').className, serie(0)), 'menos contrapeso sobe').toBe('tp-d up');
    await preencherSerie(page, 1, 80, 2);
    await proximo(page);
    /* 80 de contrapeso contra 20 da última vez cai na conferência da
       vírgula, como qualquer carga; a do "próprio peso" não vale aqui. */
    expect(await page.textContent('#appDlgTitle'), 'contrapeso alto não é "o próprio peso"').toBe('Conferir a carga');
    await clicar(page, '#appDlgOk');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open'))).toBe(false);
    const s = await sessaoHoje(page);
    expect([s.ex[0].tipo, s.ex[0].contra, s.ex[0].corpoKg, s.vol]).toEqual(['corpo', true, 80, (80 - 15) * 8 + 0]);
    expect(await page.evaluate(() => __t.evoData()['barra fixa assistida'].pts.map(p => p.kg)), 'no 1RM, o corpo menos o contrapeso').toEqual([50, 60, 65]);
  });

  test('a sessão grava o tipo; a de antes segue a marcação do treino no gráfico, sem degrau', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Paralela', 'triceps', { pesoCorpo: false })], { tdays: {
      [diaISO(4)]: [ses('s0', { vol: 400, ex: [{ n: 'Paralela', g: 'triceps', sec: [], sets: [{ kg: 40, rep: 10 }] }] })],
    } }));
    await iniciarTreino(page);
    await preencherSerie(page, 0, 40, 10);
    await proximo(page);
    expect((await sessaoHoje(page)).ex[0].tipo).toBe('carga');
    expect(await page.evaluate(() => __t.evoData()['paralela'].pts.map(p => p.kg)), 'a máquina de paralela, com carga dos dois lados').toEqual([40, 40]);
  });

  test('sessão gravada sem peso conhecido ganha o corpo no gráfico quando o peso aparece', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [diaISO(3)]: [ses('s0', { pesoDia: 0, vol: 80, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], tipo: 'corpo', sets: [{ kg: 10, rep: 8 }] }] })],
      [ontem]: [ses('s1', { pesoDia: 80, vol: 720, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], tipo: 'corpo', corpoKg: 80, sets: [{ kg: 10, rep: 8 }] }] })],
    } }));
    expect(await page.evaluate(() => __t.evoData()['barra fixa'].pts.map(p => p.kg))).toEqual([90, 90]);
  });

  test('o feed e a sessão inteira escrevem "+10 kg"; o volume é refeito das séries', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      // `vol` regravado sem o corpo por um aparelho com versão anterior
      [ontem]: [ses('s1', { pesoDia: 80, vol: 80, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], tipo: 'corpo', corpoKg: 80, sets: [{ kg: 10, rep: 8 }] }] })],
    } }));
    const t = await page.evaluate(() => ({ ex: document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-ex .es').textContent, vol: [...document.querySelectorAll('#fdFeed .fd-card[data-fd="s1"] .fd-stat .v')].at(-1).textContent }));
    expect(t).toEqual({ ex: '1× · até +10 kg', vol: '720' });
  });

  test('corrigir série: o rótulo diz "acrescentada", e o próprio peso pergunta', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [ontem]: [ses('s1', { pesoDia: 80, vol: 720, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], tipo: 'corpo', corpoKg: 80, sets: [{ kg: 10, rep: 8 }] }] })],
    } }));
    await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] [data-fdver]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    await page.evaluate(() => document.querySelector('#ssCorpo .ss-serie').click());
    await page.waitForSelector('#serieOverlay.open');
    expect(await page.evaluate(() => [document.getElementById('serieKgLbl').textContent, document.getElementById('serieNota').textContent])).toEqual(['Carga acrescentada (kg)', 'Seu peso contou 80 kg em cada repetição.']);
    await page.fill('#serieKg', '90');
    await clicar(page, '#serieSalvar');
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgTitle')).toBe('Carga acrescentada');
    await clicar(page, '#appDlgCancel');
    await page.waitForTimeout(200);
    expect(await page.evaluate(d => __t.store.tdays[d][0].ex[0].sets[0].kg, ontem), '"Corrigir" não grava').toBe(10);
  });

  test('o mesmo exercício duas vezes no treino pergunta o peso uma vez só', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Paralela livre', 'triceps'), ex('Supino reto', 'peito'), ex('Paralela livre', 'triceps')]));
    await iniciarTreino(page);
    await clicar(page, '#trMaisCarga');
    await preencherSerie(page, 0, 70, 8);
    await clicar(page, '#trNext');
    await page.waitForSelector('#appDlgOverlay.open');
    await clicar(page, '#appDlgOk');
    await page.waitForTimeout(400);
    await proximo(page);
    expect(await page.evaluate(() => __t.trS.idx)).toBe(2);
    await preencherSerie(page, 0, 70, 8);
    await clicar(page, '#trNext');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open'))).toBe(false);
  });

  test('sem fração medida, a pergunta não diz que o peso já conta', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Mergulho no banco', 'triceps'), ex('Supino reto', 'peito')]));
    await iniciarTreino(page);
    await clicar(page, '#trMaisCarga');
    await preencherSerie(page, 0, 80, 8);
    await clicar(page, '#trNext');
    await page.waitForSelector('#appDlgOverlay.open');
    const m = await page.textContent('#appDlgMsg');
    expect(m).not.toMatch(/já conta/);
    expect(m).toMatch(/No campo vai só o que você acrescenta, como colete, anilha ou cinto, e não o seu peso\./);
  });

  test('o recorde espera a pergunta do peso: primeiro "Carga acrescentada", depois o recorde', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa'), ex('Supino reto', 'peito')], { tdays: {
      [diaISO(40)]: [ses('s0', { vol: 80, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], sets: [{ kg: 10, rep: 8 }] }] })],
      [diaISO(20)]: [ses('s1', { vol: 0, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], sets: [{ kg: 0, rep: 8 }] }] })],
    } }));
    await iniciarTreino(page);
    await clicar(page, '#trMaisCarga');
    await page.evaluate(() => { const c = document.querySelector('#trSets .tr-set[data-i="0"] .ikg'); c.value = '80'; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open')), 'nada no "change"').toBe(false);
    await clicar(page, '#trNext');
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgTitle')).toBe('Carga acrescentada');
    await clicar(page, '#appDlgOk');
    await page.waitForFunction(() => document.getElementById('appDlgTitle').textContent === 'Carga de recorde depois da pausa' && document.getElementById('appDlgOverlay').classList.contains('open'), null, { timeout: 5000 });
  });

  test('a referência segue a marcação: "Com carga" não deixa a série esquecida apagar a carga', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Paralela', 'triceps', { pesoCorpo: false })], { tdays: {
      [diaISO(4)]: [ses('s0', { vol: 400, ex: [{ n: 'Paralela', g: 'triceps', sec: [], sets: [{ kg: 40, rep: 10 }] }] })],
      [diaISO(2)]: [ses('s1', { vol: 0, ex: [{ n: 'Paralela', g: 'triceps', sec: [], sets: [{ kg: 0, rep: 10 }] }] })],
    } }));
    await iniciarTreino(page);
    expect(await page.evaluate(s => document.querySelector(s + ' .tp-v').textContent, serie(0))).toBe('40 kg × 10');
  });

  test('editor: renomear um exercício marcado volta a seguir o nome novo, até tocar de novo', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Agachamento pistol', 'quadriceps', { pesoCorpo: true }), ex('Abdominal', 'abdomen', { pesoCorpo: true })]));
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.waitForTimeout(200);
    await clicar(page, '#tOpenProtocol');
    await page.waitForSelector('#tprotoOverlay.open');
    await clicar(page, '#tprotoList [data-ted="w1"]');
    await page.waitForSelector('#tpEditOverlay.open');
    await page.evaluate(() => document.querySelectorAll('#tpExList .ed[data-ed]')[1].click());
    await page.fill('#tpExName', 'Abdominal na polia');
    expect(await page.evaluate(() => document.querySelector('#tpExCarga button.on').dataset.v), 'a polia é carga').toBe('carga');
    await clicar(page, '#tpExAdd');
    await page.evaluate(() => document.querySelectorAll('#tpExList .ed[data-ed]')[0].click());
    await page.fill('#tpExName', 'Agachamento pistol com salto');
    await clicar(page, '#tpExCarga [data-v="corpo"]');
    await clicar(page, '#tpExAdd');
    await clicar(page, '#tpSave');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.tprotocol[0].ex.map(e => [e.n, 'pesoCorpo' in e ? e.pesoCorpo : 'nome']))).toEqual([['Agachamento pistol com salto', true], ['Abdominal na polia', 'nome']]);
  });

  test('o tipo gravado na sessão vale mais que o nome e a marcação de hoje', async ({ page }) => {
    // feita "Com carga" na época; hoje o treino não tem marcação e o nome diz peso do corpo
    await abrirApp(page, comTreino([ex('Barra fixa')], { tdays: {
      [ontem]: [ses('s1', { pesoDia: 80, vol: 160, ex: [{ n: 'Barra fixa', g: 'costas', sec: [], tipo: 'carga', sets: [{ kg: 20, rep: 8 }] }] })],
    } }));
    expect(await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-ex .es').textContent)).toBe('1× · até 20 kg');
  });

  test('barra assistida contra uma sessão de antes: o contrapeso não vira "queda de carga"', async ({ page }) => {
    await abrirApp(page, comTreino([ex('Barra fixa assistida')], { tdays: {
      [diaISO(3)]: [ses('s0', { vol: 240, ex: [{ n: 'Barra fixa assistida', g: 'costas', sec: [], sets: [{ kg: 30, rep: 8 }] }] })],
      [ontem]: [ses('s1', { pesoDia: 80, vol: 480, ex: [{ n: 'Barra fixa assistida', g: 'costas', sec: [], tipo: 'corpo', corpoKg: 80, contra: true, sets: [{ kg: 20, rep: 8 }] }] })],
    } }));
    expect(await page.evaluate(() => document.querySelector('#fdFeed .fd-card[data-fd="s1"] .fd-prog').textContent)).toBe('mesmas reps');
  });
});
