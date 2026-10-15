/* Tempo sem treinar (#81): o diário de pausas e o aviso da carga de recorde.

   O dono pediu duas coisas: registrar o tempo em que ficou sem treinar, e um
   aviso quando, na volta, a pessoa puser a carga do recorde. Duas pausas: a
   da musculação e a do cardio (o treino avulso, que também é treino). O
   aviso olha só a musculação, e nunca inventa número: nada de porcentagem
   nem de carga sugerida, porque nenhum estudo dá esse número. Os riscos aqui:
   avisar sem motivo (peso do corpo, outra academia, a vírgula), deixar de
   avisar, travar o descanso, e a pausa entrar na conta de calorias ou no
   feed como se fosse uma sessão. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO, preencherSerie } = require('./app');

const forca = (id, kg, extra = {}) => ({
  id, name: 'Treino A', min: 50, kcal: 300, vol: kg * 10, intens: 'moderada', rir: 2, tid: 'w1',
  ex: [{ n: 'Supino reto', g: 'peito', sec: [], sets: [{ kg, rep: 10, rir: 2 }] }],
  ...extra,
});
const cardio = id => ({ id, name: 'Caminhada', min: 40, kcal: 150, km: 3, intens: 'moderada · 4,5 km/h' });
/** Supino reto 100 kg há `dias` dias, e nada depois. */
const voltaDe = (dias, extra = {}) => estadoBase({ tdays: { [diaISO(dias)]: [forca('s1', 100)] }, ...extra });

const irTreino = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForTimeout(250);
};
const iniciar = async (page, wid = 'w1') => {
  await irTreino(page);
  await page.evaluate(wid => document.querySelector(`#tprotoCards [data-tw="${wid}"]`).click(), wid);
  await page.waitForSelector('#trSets .tr-set', { timeout: 10000 });
};
/** Digita a carga e termina de digitar (o "change" que a pessoa dispara ao sair do campo). */
const carga = (page, i, kg) => page.evaluate(({ i, kg }) => {
  const c = document.querySelector(`#trSets .tr-set[data-i="${i}"] .ikg`);
  c.value = String(kg); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true }));
}, { i, kg });
const dialogo = page => page.evaluate(() => ({
  aberto: document.getElementById('appDlgOverlay').classList.contains('open'),
  titulo: document.getElementById('appDlgTitle').textContent,
  msg: document.getElementById('appDlgMsg').textContent,
  ok: document.getElementById('appDlgOk').textContent,
  cancel: document.getElementById('appDlgCancel').textContent,
}));
const responder = async (page, sim) => {
  await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
  await page.evaluate(s => document.getElementById(s ? 'appDlgOk' : 'appDlgCancel').click(), sim);
  await page.waitForTimeout(150);
};
const semDialogo = async page => { await page.waitForTimeout(250); expect((await dialogo(page)).aberto).toBe(false); };
const nota = page => page.evaluate(() => document.querySelector('#trSets .tr-pausa')?.textContent || '');
const linhaSerie = (page, i) => page.evaluate(i => {
  const el = document.querySelector(`#trSets .tr-set[data-i="${i}"] .tsrec`);
  return el && !el.hidden ? el.textContent : '';
}, i);
/** Outro cenário na mesma página: sem o treino em andamento nem a academia do anterior. */
const reabrir = async (page, st) => { await page.evaluate(() => localStorage.clear()); return abrirApp(page, st); };
const pausasGravadas = page => page.evaluate(() => __t.store.pausas || []);
const abrirNova = async page => {
  await irTreino(page);
  await page.evaluate(() => document.getElementById('pausaNova').click());
  await page.waitForSelector('#pausaOverlay.open');
};
const preencherPausa = async (page, { tipo, de, ate, motivo, nota: n }) => {
  if (tipo) await page.evaluate(t => document.querySelector(`#pausaTipoSeg [data-v="${t}"]`).click(), tipo);
  if (de !== undefined) await page.fill('#pausaDe', de);
  if (ate !== undefined) await page.fill('#pausaAte', ate);
  if (motivo !== undefined) await page.selectOption('#pausaMotivo', motivo);
  if (n !== undefined) await page.fill('#pausaNota', n);
};
const salvar = async page => { await page.evaluate(() => document.getElementById('pausaSalvar').click()); await page.waitForTimeout(200); };
const aviso = page => page.evaluate(() => { const a = document.getElementById('pausaAviso'); return a.hidden ? '' : a.textContent; });

test.describe('Diário de pausas', () => {

  test('registrar uma pausa de musculação pela aba Treino, e ela sobrevive a recarregar', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await abrirNova(page);
    expect(await page.evaluate(() => document.querySelector('#pausaTipoSeg .on').dataset.v), 'começa em musculação').toBe('forca');
    await preencherPausa(page, { de: diaISO(10), ate: diaISO(3), motivo: 'viagem', nota: 'férias na praia' });
    expect(await page.textContent('#pausaDur')).toBe('8 dias sem treinar');
    await salvar(page);
    expect(await page.evaluate(() => document.getElementById('pausaOverlay').classList.contains('open'))).toBe(false);
    const p = (await pausasGravadas(page))[0];
    expect(p).toMatchObject({ tipo: 'forca', de: diaISO(10), ate: diaISO(3), motivo: 'viagem', nota: 'férias na praia' });
    const linha = await page.textContent('#pausaLista');
    expect(linha).toMatch(/Musculação · .* · 8 dias/);
    expect(linha).toMatch(/Viagem · férias na praia/);
    await page.reload();
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    expect((await pausasGravadas(page)).length).toBe(1);
    expect(erros).toEqual([]);
  });

  test('pausa em aberto: grava sem o fim, aparece no Início, e "Voltei a treinar hoje" fecha ontem', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await abrirNova(page);
    await preencherPausa(page, { de: diaISO(5), ate: '' });
    expect(await page.textContent('#pausaDur')).toBe('6 dias até hoje');
    await salvar(page);
    const p = (await pausasGravadas(page))[0];
    expect('ate' in p, 'em aberto é SEM a chave: o Firestore recusa undefined').toBe(false);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(250);
    expect(await page.textContent('#fdPausas')).toMatch(/Pausa da musculação · 6 dias/);
    await page.evaluate(() => document.querySelector('#fdPausas [data-fdpausa]').click());
    await page.waitForSelector('#pausaOverlay.open');
    await page.evaluate(() => document.getElementById('pausaVoltei').click());
    await page.waitForTimeout(200);
    expect((await pausasGravadas(page))[0].ate).toBe(diaISO(1));
    expect(await page.evaluate(() => document.querySelectorAll('#fdPausas [data-fdpausa]').length)).toBe(0);
  });

  test('recusas aparecem embaixo dos campos e não gravam nada', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(20), ate: diaISO(15), motivo: '', nota: '' }] }));
    await abrirNova(page);
    const casos = [
      [{ de: diaISO(3), ate: diaISO(5) }, /vem depois do primeiro/],
      [{ de: diaISO(-1), ate: '' }, /não pode começar depois de hoje/],
      [{ de: diaISO(3), ate: diaISO(-1) }, /não pode ser depois de hoje/],
      [{ de: diaISO(17), ate: diaISO(10) }, /Já existe uma pausa da musculação de .* Edite aquela/],
      [{ de: '', ate: '' }, /Diga o primeiro dia/],
    ];
    for (const [campos, re] of casos) {
      await preencherPausa(page, campos);
      await salvar(page);
      expect(await aviso(page)).toMatch(re);
    }
    expect((await pausasGravadas(page)).length).toBe(1);
    expect(await page.textContent('#flash'), 'o aviso fica embaixo do campo, não no cartão de comida').toBe('');
    // a do cardio pode cair nos mesmos dias: são duas pausas
    await preencherPausa(page, { tipo: 'cardio', de: diaISO(17), ate: diaISO(10) });
    await salvar(page);
    expect((await pausasGravadas(page)).map(p => p.tipo).sort()).toEqual(['cardio', 'forca']);
  });

  test('duas pausas em aberto do mesmo tipo não; uma de cada, sim', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(9), motivo: '', nota: '' }] }));
    await abrirNova(page);
    await preencherPausa(page, { de: diaISO(2), ate: '' });
    await salvar(page);
    expect(await aviso(page)).toMatch(/Já existe uma pausa da musculação desde/);
    await preencherPausa(page, { tipo: 'cardio' });
    await salvar(page);
    expect((await pausasGravadas(page)).length).toBe(2);
  });

  test('treino do mesmo tipo dentro das datas pergunta antes de salvar', async ({ page }) => {
    await abrirApp(page, estadoBase({ tdays: { [diaISO(5)]: [forca('s1', 100)], [diaISO(4)]: [cardio('c1')] } }));
    await abrirNova(page);
    await preencherPausa(page, { de: diaISO(7), ate: diaISO(2) });
    await page.evaluate(() => document.getElementById('pausaSalvar').click());
    const d = await (async () => { await page.waitForSelector('#appDlgOverlay.open'); return dialogo(page); })();
    expect(d.titulo).toBe('Conferir as datas');
    expect(d.msg).toMatch(/treino de musculação registrado em/);
    await responder(page, false);   // Corrigir as datas
    expect((await pausasGravadas(page)).length).toBe(0);
    expect(await page.evaluate(() => document.getElementById('pausaOverlay').classList.contains('open'))).toBe(true);
    await page.evaluate(() => document.getElementById('pausaSalvar').click());
    await responder(page, true);    // Salvar assim
    expect((await pausasGravadas(page)).length).toBe(1);
    // cardio dentro de uma pausa de musculação não pergunta
    await abrirNova(page);
    await preencherPausa(page, { tipo: 'forca', de: diaISO(4), ate: diaISO(4) });
    await page.evaluate(() => { __t.store.pausas = []; });
    await salvar(page);
    await semDialogo(page);
  });

  test('"Excluir" pede confirmação e não mexe no histórico', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tdays: { [diaISO(30)]: [forca('s1', 100)] },
      pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(20), ate: diaISO(10), motivo: '', nota: '' }],
    }));
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#pausaLista [data-pdel="p1"]').click());
    const d = await (async () => { await page.waitForSelector('#appDlgOverlay.open'); return dialogo(page); })();
    expect(d.ok).toBe('Apagar');
    expect(d.msg).toMatch(/Os treinos registrados não mudam/);
    await responder(page, true);
    expect(await pausasGravadas(page)).toEqual([]);
    expect(Object.keys(await page.evaluate(() => __t.store.tdays))).toEqual([diaISO(30)]);
  });

  test('finalizar musculação fecha a pausa da musculação, não a do cardio; a de hoje fica', async ({ page }) => {
    await abrirApp(page, estadoBase({
      pausas: [
        { id: 'pf', tipo: 'forca', de: diaISO(6), motivo: '', nota: '' },
        { id: 'pc', tipo: 'cardio', de: diaISO(6), motivo: '', nota: '' },
      ],
    }));
    await iniciar(page);
    await preencherSerie(page, 0, 60, 10, 1);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(400);
    const ps = await pausasGravadas(page);
    expect(ps.find(p => p.id === 'pf').ate).toBe(diaISO(1));
    expect('ate' in ps.find(p => p.id === 'pc'), 'musculação não fecha a pausa do cardio').toBe(false);
  });

  test('o treino avulso (cardio) fecha a pausa do cardio e não a da musculação', async ({ page }) => {
    await abrirApp(page, estadoBase({
      pausas: [
        { id: 'pf', tipo: 'forca', de: diaISO(6), motivo: '', nota: '' },
        { id: 'pc', tipo: 'cardio', de: diaISO(6), motivo: '', nota: '' },
        { id: 'ph', tipo: 'cardio', de: diaISO(0), ate: diaISO(0), motivo: '', nota: '' },
      ],
    }));
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#tTabs [data-tab="avulso"]').click());
    await page.waitForTimeout(200);
    await page.selectOption('#taAct', { label: 'Caminhada' });
    await page.evaluate(() => { const c = document.getElementById('taMin'); c.value = '40'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    const ps = await pausasGravadas(page);
    expect(ps.find(p => p.id === 'pc').ate).toBe(diaISO(1));
    expect('ate' in ps.find(p => p.id === 'pf'), 'cardio não fecha a pausa da musculação').toBe(false);
  });

  test('a pausa que começou hoje não é fechada por um treino de hoje', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'pf', tipo: 'forca', de: diaISO(0), motivo: '', nota: '' }] }));
    await iniciar(page);
    await preencherSerie(page, 0, 60, 10, 1);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(400);
    expect('ate' in (await pausasGravadas(page))[0]).toBe(false);
  });

  test('a dica de registrar aparece com 14 dias ou mais sem musculação, e propõe o dia seguinte ao último treino', async ({ page }) => {
    await abrirApp(page, voltaDe(20));
    await irTreino(page);
    expect(await page.evaluate(() => document.getElementById('pausaDica').hidden)).toBe(false);
    expect(await page.textContent('#pausaDica')).toMatch(/há 20 dias/);
    await page.evaluate(() => document.getElementById('pausaDicaBt').click());
    await page.waitForSelector('#pausaOverlay.open');
    expect(await page.inputValue('#pausaDe')).toBe(diaISO(19));
    expect(await pausasGravadas(page), 'é só proposta: nada gravado sem "Salvar"').toEqual([]);
    await salvar(page);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.getElementById('pausaDica').hidden), 'a pausa registrada explica o intervalo').toBe(true);
  });

  test('a pausa entra no feed como marcador, sem virar sessão', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tdays: { [diaISO(12)]: [forca('s1', 100)], [diaISO(2)]: [forca('s2', 100)] },
      pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(10), ate: diaISO(4), motivo: 'viagem', nota: '' }],
    }));
    const r = await page.evaluate(() => ({
      cards: document.querySelectorAll('#fdFeed .fd-card').length,
      ordem: [...document.querySelectorAll('#fdFeed > *')].map(e => e.classList.contains('fd-pausa') ? 'pausa' : e.classList.contains('fd-card') ? 'sessao' : null).filter(Boolean),
      marca: document.querySelector('#fdFeed .fd-pausa')?.textContent,
      conta: document.getElementById('fdCount').textContent,
    }));
    expect(r.cards).toBe(2);
    expect(r.ordem).toEqual(['sessao', 'pausa', 'sessao']);
    expect(r.marca).toMatch(/Pausa da musculação · .* · 7 dias · Viagem/);
    expect(r.conta).toBe('2 sessões');
    // a pausa não entra em calorias nem em quilômetros do dia
    expect(await page.evaluate(() => __t.kmAtividades(__t.todayKey()))).toBe(0);
  });

  test('sem sessão nenhuma, o feed continua vazio, sem marcador', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(10), ate: diaISO(4), motivo: '', nota: '' }] }));
    expect(await page.evaluate(() => [!!document.querySelector('#fdFeed .fd-vazio'), document.querySelectorAll('#fdFeed .fd-pausa').length])).toEqual([true, 0]);
  });

  test('"Musculação" lançada no treino avulso é musculação: fecha a pausa dela, não a do cardio, e conta como treino de força', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tdays: { [diaISO(20)]: [forca('s1', 100)] },
      pausas: [
        { id: 'pf', tipo: 'forca', de: diaISO(6), motivo: '', nota: '' },
        { id: 'pc', tipo: 'cardio', de: diaISO(6), motivo: '', nota: '' },
      ],
    }));
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#tTabs [data-tab="avulso"]').click());
    await page.waitForTimeout(200);
    await page.selectOption('#taAct', { label: 'Musculação' });
    await page.evaluate(() => { const c = document.getElementById('taMin'); c.value = '45'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    const ps = await pausasGravadas(page);
    expect(ps.find(p => p.id === 'pf').ate).toBe(diaISO(1));
    expect('ate' in ps.find(p => p.id === 'pc')).toBe(false);
    expect(await page.evaluate(() => __t.retornoDe(__t.todayKey()).dias), 'treinou hoje').toBe(0);
  });

  test('finalizar um treino sem nenhuma série não fecha a pausa', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'pf', tipo: 'forca', de: diaISO(6), motivo: '', nota: '' }] }));
    await iniciar(page);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(400);
    expect('ate' in (await pausasGravadas(page))[0]).toBe(false);
  });

  test('duas pausas abertas do mesmo tipo (vindas de dois aparelhos): o Início mostra as duas, e treinar fecha as duas', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [
      { id: 'p1', tipo: 'forca', de: diaISO(9), motivo: '', nota: '' },
      { id: 'p2', tipo: 'forca', de: diaISO(5), motivo: '', nota: '' },
    ] }));
    expect(await page.evaluate(() => document.querySelectorAll('#fdPausas [data-fdpausa]').length)).toBe(2);
    await iniciar(page);
    await preencherSerie(page, 0, 60, 10, 1);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(400);
    expect((await pausasGravadas(page)).map(p => p.ate)).toEqual([diaISO(1), diaISO(1)]);
    expect(await page.evaluate(() => document.querySelectorAll('#fdPausas [data-fdpausa]').length)).toBe(0);
  });

  test('excluir o treino que fechou a pausa a reabre; a fechada à mão continua fechada', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [
      { id: 'pc', tipo: 'cardio', de: diaISO(6), motivo: '', nota: '' },
      { id: 'pm', tipo: 'cardio', de: diaISO(30), ate: diaISO(20), motivo: '', nota: '' },
    ] }));
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#tTabs [data-tab="avulso"]').click());
    await page.waitForTimeout(200);
    await page.selectOption('#taAct', { label: 'Caminhada' });
    await page.evaluate(() => { const c = document.getElementById('taMin'); c.value = '30'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('taAdd').click());
    await page.waitForTimeout(300);
    expect((await pausasGravadas(page)).find(p => p.id === 'pc').ate).toBe(diaISO(1));
    await page.evaluate(() => document.querySelector('#tTodayList [data-tdel]').click());
    await page.waitForTimeout(300);
    const ps = await pausasGravadas(page);
    expect('ate' in ps.find(p => p.id === 'pc'), 'o lançamento foi apagado: a pausa não acabou').toBe(false);
    expect(ps.find(p => p.id === 'pm').ate).toBe(diaISO(20));
  });

  test('"Voltei a treinar hoje" não aparece numa pausa que começou hoje', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(0), motivo: '', nota: '' }] }));
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#pausaLista [data-pausa="p1"]').click());
    await page.waitForSelector('#pausaOverlay.open');
    expect(await page.evaluate(() => ['pausaVoltei', 'pausaApagar'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none'))).toEqual([false, true]);
  });

  test('"Apagar" apaga mesmo se a nuvem trocar o store com a pergunta aberta', async ({ page }) => {
    await abrirApp(page, estadoBase({ pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(9), ate: diaISO(3), motivo: '', nota: '' }] }));
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#pausaLista [data-pdel="p1"]').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => { __t.store.pausas = JSON.parse(JSON.stringify(__t.store.pausas)); });   // objetos novos, como os da nuvem
    await responder(page, true);
    expect(await pausasGravadas(page)).toEqual([]);
  });

  test('uma pausa curta, encerrada há semanas, não explica a volta: a dica aparece depois dela, e a nota não diz "De volta da pausa"', async ({ page }) => {
    await abrirApp(page, voltaDe(44, { pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(43), ate: diaISO(40), motivo: 'viagem', nota: '' }] }));
    await irTreino(page);
    expect(await page.evaluate(() => document.getElementById('pausaDica').hidden)).toBe(false);
    await page.evaluate(() => document.getElementById('pausaDicaBt').click());
    await page.waitForSelector('#pausaOverlay.open');
    expect(await page.inputValue('#pausaDe'), 'começa depois da pausa já registrada').toBe(diaISO(39));
    await page.evaluate(() => document.getElementById('pausaFechar').click());
    await page.evaluate(wid => document.querySelector(`#tprotoCards [data-tw="${wid}"]`).click(), 'w1');
    await page.waitForSelector('#trSets .tr-set', { timeout: 10000 });
    expect(await nota(page)).toMatch(/^Último treino de força registrado: há 44 dias/);
  });
});

test.describe('Aviso da carga de recorde na volta', () => {

  test('depois de 20 dias: a nota, a linha da série e a pergunta, sem porcentagem nem carga sugerida', async ({ page }) => {
    const erros = await abrirApp(page, voltaDe(20));
    await iniciar(page);
    const n = await nota(page);
    expect(n).toMatch(/Último treino de força registrado: há 20 dias/);
    expect(n).toMatch(/recorde neste exercício é 100 kg/);
    expect(n).not.toMatch(/%/);
    expect(await page.evaluate(() => document.querySelector('#trSets .tr-set .ikg').placeholder), 'o placeholder continua a última carga, não uma reduzida').toBe('100');
    await carga(page, 0, 100);
    expect(await linhaSerie(page, 0)).toBe('É o seu recorde (100 kg), e o último treino de força foi há 20 dias.');
    await page.waitForSelector('#appDlgOverlay.open');
    const d = await dialogo(page);
    expect(d.titulo).toBe('Carga de recorde depois da pausa');
    expect(d.msg).toMatch(/Série 1 com 100 kg: é o seu recorde em Supino reto/);
    expect(d.msg).toMatch(/20 dias/);
    expect(d.msg).toMatch(/força máxima costuma se manter/);
    expect(d.msg).not.toMatch(/%|lesão|perig/);
    expect([d.ok, d.cancel]).toEqual(['Manter 100 kg', 'Mudar a carga']);
    await responder(page, true);
    expect(erros).toEqual([]);
  });

  test('"Mudar a carga" não troca o número e segura o avanço; abaixo do recorde a linha some', async ({ page }) => {
    await abrirApp(page, voltaDe(20));
    await iniciar(page);
    await carga(page, 0, 100);
    await responder(page, false);
    expect(await page.evaluate(() => {
      const c = document.querySelector('#trSets .tr-set[data-i="0"] .ikg');
      return [c.value, document.activeElement === c];
    })).toEqual(['100', true]);
    // seguir com o recorde ainda lá pergunta de novo; "Mudar a carga" não avança
    await page.evaluate(() => document.getElementById('trNext').click());
    await responder(page, false);
    expect(await page.evaluate(() => __t.trS.idx)).toBe(0);
    await carga(page, 0, 90);
    expect(await linhaSerie(page, 0)).toBe('');
    await semDialogo(page);
  });

  test('"Manter" pergunta uma vez por exercício, também depois de o app ser descartado', async ({ page }) => {
    await abrirApp(page, voltaDe(20));
    await iniciar(page);
    await carga(page, 0, 100);
    await responder(page, true);
    await preencherSerie(page, 0, undefined, 8);
    await carga(page, 1, 100);
    await semDialogo(page);
    await page.waitForTimeout(500);   // a gravação do treino em andamento
    await page.reload();
    await page.waitForSelector('#trSets .tr-set', { timeout: 15000 });
    await carga(page, 2, 102.5);
    await semDialogo(page);
    expect(await linhaSerie(page, 2), 'a linha continua dizendo').toMatch(/^Acima do seu recorde \(100 kg\)/);
    // finalizar: a marca não vai para o histórico
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(400);
    const reg = await page.evaluate(() => __t.store.tdays[__t.todayKey()][0]);
    expect('recordeOk' in reg.ex[0]).toBe(false);
  });

  test('limiar: 13 dias não avisa, 14 avisa, 28 usa o texto da pausa longa', async ({ page }) => {
    await abrirApp(page, voltaDe(13));
    await iniciar(page);
    expect(await nota(page)).toBe('');
    await carga(page, 0, 100);
    await semDialogo(page);

    await reabrir(page, voltaDe(14));
    await iniciar(page);
    expect(await nota(page)).toMatch(/há 14 dias/);

    await reabrir(page, voltaDe(28));
    await iniciar(page);
    await carga(page, 0, 100);
    await page.waitForSelector('#appDlgOverlay.open');
    expect((await dialogo(page)).msg).toMatch(/Numa pausa longa assim, a força máxima pode ter caído/);
  });

  test('abaixo do recorde não avisa', async ({ page }) => {
    await abrirApp(page, voltaDe(20));
    await iniciar(page);
    await carga(page, 0, 95);
    expect(await linhaSerie(page, 0)).toBe('');
    await semDialogo(page);
  });

  test('cardio não zera a contagem da musculação; musculação em outra academia zera', async ({ page }) => {
    await abrirApp(page, voltaDe(20, { tdays: { [diaISO(20)]: [forca('s1', 100)], [diaISO(1)]: [cardio('c1')] } }));
    await iniciar(page);
    expect(await nota(page)).toMatch(/há 20 dias/);

    await reabrir(page, {
      ...estadoBase({
        academias: [{ id: 'a1', nome: 'Smart Fit' }, { id: 'a2', nome: 'Prédio' }],
        tdays: {
          [diaISO(20)]: [forca('s1', 100, { acad: 'a1', acadNome: 'Smart Fit' })],
          [diaISO(1)]: [forca('s2', 40, { acad: 'a2', acadNome: 'Prédio', ex: [{ n: 'Leg press', g: 'quadriceps', sec: [], sets: [{ kg: 40, rep: 10 }] }] })],
        },
      }),
      'tresults.acad': 'a1',
    });
    await iniciar(page);
    expect(await nota(page), 'treinou ontem, em outra academia: o corpo não ficou parado').toBe('');
  });

  test('recorde de outra academia não é régua; registro sem academia vale em qualquer uma', async ({ page }) => {
    const acads = [{ id: 'a1', nome: 'Smart Fit' }, { id: 'a2', nome: 'Prédio' }];
    await abrirApp(page, { ...estadoBase({ academias: acads, tdays: { [diaISO(20)]: [forca('s1', 100, { acad: 'a2', acadNome: 'Prédio' })] } }), 'tresults.acad': 'a1' });
    await iniciar(page);
    expect(await nota(page)).toBe('');
    await carga(page, 0, 100);
    await semDialogo(page);

    await reabrir(page, { ...estadoBase({ academias: acads, tdays: { [diaISO(20)]: [forca('s1', 100)] } }), 'tresults.acad': 'a1' });
    await iniciar(page);
    expect(await nota(page)).toMatch(/recorde neste exercício é 100 kg/);
  });

  test('peso do corpo: flexão em reps nunca avisa; barra fixa com colete avisa pela carga', async ({ page }) => {
    const treinos = [{ id: 'w1', nome: 'Treino A', cat: 'A', ex: [{ n: 'Flexão de braço', s: 3, rest: 60, g: 'peito', sec: [] }, { n: 'Barra fixa', s: 3, rest: 90, g: 'costas', sec: [] }] }];
    await abrirApp(page, estadoBase({
      tprotocol: treinos,
      tdays: { [diaISO(20)]: [{ id: 's1', name: 'Treino A', min: 30, kcal: 200, vol: 0, tid: 'w1', ex: [
        { n: 'Flexão de braço', g: 'peito', sec: [], sets: [{ kg: 0, rep: 20 }] },
        { n: 'Barra fixa', g: 'costas', sec: [], sets: [{ kg: 10, rep: 8 }] },
      ] }] },
    }));
    await iniciar(page);
    expect(await nota(page), 'flexão sem carga não tem recorde em kg').toBe('');
    await preencherSerie(page, 0, undefined, 25);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __t.trS.idx)).toBe(1);
    expect(await nota(page)).toMatch(/recorde neste exercício é 10 kg/);
    await carga(page, 0, 10);
    expect(await linhaSerie(page, 0)).toMatch(/É o seu recorde \(10 kg\)/);
    await responder(page, true);
  });

  test('a vírgula vence: 575 com recorde de 57,5 pergunta "Conferir a carga", não o recorde', async ({ page }) => {
    await abrirApp(page, estadoBase({ tdays: { [diaISO(20)]: [forca('s1', 57.5)] } }));
    await iniciar(page);
    await carga(page, 0, 575);
    expect(await linhaSerie(page, 0)).toBe('');
    await semDialogo(page);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect((await dialogo(page)).titulo).toBe('Conferir a carga');
    await responder(page, false);
    expect(await page.evaluate(() => __t.trS.idx)).toBe(0);
  });

  test('o descanso continua correndo enquanto a pergunta é respondida', async ({ page }) => {
    await abrirApp(page, voltaDe(20));
    await iniciar(page);
    await preencherSerie(page, 0, 90, 10, 1);
    await page.evaluate(() => document.getElementById('trRest').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __t.trRestEnd)).toBeGreaterThan(0);
    await carga(page, 1, 100);
    await responder(page, true);
    expect(await page.evaluate(() => __t.trRestEnd), 'o descanso não pode ser interrompido').toBeGreaterThan(0);
    expect(await page.evaluate(() => document.querySelector('#trSets .tr-set[data-i="1"] .ikg').value)).toBe('100');
  });

  test('dois diálogos não se atropelam: a pergunta do recorde e depois a de cancelar o treino', async ({ page }) => {
    await abrirApp(page, voltaDe(20));
    await iniciar(page);
    await carga(page, 0, 100);
    await page.evaluate(() => document.getElementById('trQuit').click());
    await page.waitForTimeout(200);
    expect((await dialogo(page)).titulo).toBe('Carga de recorde depois da pausa');
    await responder(page, true);
    await page.waitForSelector('#appDlgOverlay.open');
    const d = await dialogo(page);
    expect(d.msg).toMatch(/Cancelar o treino em andamento/);
    await responder(page, false);   // continuar treino
    expect(await page.evaluate(() => [!!__t.trS, document.getElementById('appDlgOverlay').classList.contains('open')])).toEqual([true, false]);
  });

  test('trocar o exercício pergunta pelo outro; "Desfazer" não pergunta de novo', async ({ page }) => {
    await abrirApp(page, estadoBase({ tdays: { [diaISO(20)]: [forca('s1', 100, { ex: [
      { n: 'Supino reto', g: 'peito', sec: [], sets: [{ kg: 100, rep: 10 }] },
      { n: 'Supino inclinado', g: 'peito', sec: [], sets: [{ kg: 80, rep: 10 }] },
    ] })] } }));
    await iniciar(page);
    await carga(page, 0, 100);
    await responder(page, true);
    await page.evaluate(() => document.getElementById('trTrocar').click());
    await page.waitForSelector('#trocaOverlay.open');
    await page.fill('#trocaNome', 'Supino inclinado');
    await page.evaluate(() => document.getElementById('trocaOk').click());
    await page.waitForTimeout(200);
    expect(await nota(page)).toMatch(/recorde neste exercício é 80 kg/);
    await carga(page, 0, 80);
    await responder(page, true);
    await page.evaluate(() => document.getElementById('trDesfazer').click());
    await page.waitForTimeout(200);
    await carga(page, 1, 100);
    await semDialogo(page);
  });

  test('depois de "Está certo" na conferência da vírgula, a pergunta do recorde vem', async ({ page }) => {
    /* Recorde de 100; a última vez foi leve (40), antes de parar. 100 parece
       vírgula perdida diante dos 40, e "Conferir a carga" pergunta primeiro.
       Confirmado o número, o recorde não pode ficar sem aviso. */
    await abrirApp(page, estadoBase({ tdays: { [diaISO(40)]: [forca('s0', 100)], [diaISO(20)]: [forca('s1', 40)] } }));
    await iniciar(page);
    await carga(page, 0, 100);
    await semDialogo(page);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect((await dialogo(page)).titulo).toBe('Conferir a carga');
    await responder(page, true);   // Está certo
    await page.waitForSelector('#appDlgOverlay.open');
    expect((await dialogo(page)).titulo).toBe('Carga de recorde depois da pausa');
    await responder(page, false);
    expect(await page.evaluate(() => __t.trS.idx)).toBe(0);
  });

  test('o mesmo exercício em duas posições do treino: "Manter" vale para as duas', async ({ page }) => {
    await abrirApp(page, voltaDe(20, { tprotocol: [{ id: 'w1', nome: 'Treino A', cat: 'A', ex: [
      { n: 'Supino reto', s: 2, rest: 90, g: 'peito', sec: [] },
      { n: 'Remada curvada', s: 2, rest: 60, g: 'costas', sec: [] },
      { n: 'Supino reto', s: 2, rest: 90, g: 'peito', sec: [] },
    ] }] }));
    await iniciar(page);
    await carga(page, 0, 100);
    await responder(page, true);
    await preencherSerie(page, 0, undefined, 8);
    for (let k = 0; k < 2; k++) {
      await page.evaluate(() => document.getElementById('trNext').click());
      await page.waitForTimeout(300);
    }
    expect(await page.evaluate(() => __t.trS.idx)).toBe(2);
    await carga(page, 0, 100);
    await semDialogo(page);
  });

  test('o nome do exercício entra sem artigo: "recorde em Rosca direta"', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tprotocol: [{ id: 'w1', nome: 'Treino B', cat: 'B', ex: [{ n: 'Rosca direta', s: 3, rest: 60, g: 'biceps', sec: [] }] }],
      tdays: { [diaISO(20)]: [{ id: 's1', name: 'Treino B', min: 30, kcal: 150, vol: 300, tid: 'w1', ex: [{ n: 'Rosca direta', g: 'biceps', sec: [], sets: [{ kg: 30, rep: 10 }] }] }] },
    }));
    await iniciar(page);
    await carga(page, 0, 30);
    await page.waitForSelector('#appDlgOverlay.open');
    const d = await dialogo(page);
    expect(d.msg).toMatch(/é o seu recorde em Rosca direta/);
    expect(d.msg).not.toMatch(/no Rosca/);
  });

  test('pedido de diálogo idêntico ao que está aberto não empilha', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await page.evaluate(() => { window.__r = []; ['a', 'b', 'c'].forEach(x => __t.appAlert('Você já tem uma academia com esse nome.').then(() => window.__r.push(x))); });
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => [window.__r.length, document.getElementById('appDlgOverlay').classList.contains('open')])).toEqual([3, false]);
  });

  test('a pausa registrada muda o texto; o motivo "Saúde" lembra quem acompanha o tratamento', async ({ page }) => {
    await abrirApp(page, voltaDe(20, { pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(19), ate: diaISO(1), motivo: 'viagem', nota: '' }] }));
    await iniciar(page);
    expect(await nota(page)).toMatch(/De volta da pausa \(viagem\): último treino de força há 20 dias/);

    await reabrir(page, voltaDe(20, { pausas: [{ id: 'p1', tipo: 'forca', de: diaISO(19), ate: diaISO(1), motivo: 'saude', nota: '' }] }));
    await iniciar(page);
    await carga(page, 0, 100);
    await page.waitForSelector('#appDlgOverlay.open');
    const d = await dialogo(page);
    expect(d.msg).toMatch(/pausa registrada: saúde/);
    expect(d.msg).toMatch(/quem acompanha o seu tratamento é quem diz quando voltar ao recorde/);
  });

  test('uma pausa de cardio não muda o texto da musculação', async ({ page }) => {
    await abrirApp(page, voltaDe(20, { pausas: [{ id: 'p1', tipo: 'cardio', de: diaISO(19), ate: diaISO(1), motivo: 'viagem', nota: '' }] }));
    await iniciar(page);
    expect(await nota(page)).toMatch(/^Último treino de força registrado/);
  });
});

test.describe('Funções e nuvem', () => {

  test('as contas direto na função', async ({ page }) => {
    await abrirApp(page, estadoBase({ tdays: {
      [diaISO(30)]: [forca('s1', 100)],
      [diaISO(10)]: [cardio('c1'), { id: 'x', name: 'Treino A', min: 5, kcal: 10, vol: 0, ex: [] }],
      [diaISO(5)]: [{ id: 'f', name: 'Calistenia', min: 20, kcal: 80, vol: 0, ex: [{ n: 'Flexão de braço', g: 'peito', sec: [], sets: [{ kg: 0, rep: 20 }] }] }],
    } }));
    const r = await page.evaluate(([d30, d5]) => ({
      dst: [__t.diasEntre('2026-02-20', '2026-02-23'), __t.diasEntre('2026-10-30', '2026-11-03'), __t.diasEntre('2026-03-27', '2026-03-31')],
      ret: __t.retornoDe(__t.todayKey()),
      corpo: __t.prDe('Flexão de braço', ''),
      supino: __t.prDe('Supino reto', ''),
      d30, d5,
    }), [diaISO(30), diaISO(5)]);
    expect(r.dst, 'dias inteiros, mesmo com horário de verão no meio').toEqual([3, 4, 4]);
    expect(r.ret.u, 'cardio e sessão com ex:[] não contam; a flexão conta').toBe(r.d5);
    expect(r.ret.dias).toBe(5);
    expect(r.corpo, 'peso do corpo não tem recorde em kg').toBeNull();
    expect(r.supino).toEqual({ kg: 100, dk: r.d30 });
  });

  test('as pausas sobem; documento sem pausas não apaga as daqui; outra conta não herda; quem nunca teve não envia', async ({ page }) => {
    const minhas = [{ id: 'p1', tipo: 'forca', de: diaISO(10), ate: diaISO(4), motivo: 'viagem', nota: '' }];
    await abrirApp(page, estadoBase({ pausas: minhas }));
    const doc = { getd: 3000, days: {}, custom: [], liquids: {}, protocol: [], weights: [], tdays: {}, passos: {}, goals: { nome: 'Pedro', tIntro: true }, tprotocol: [] };
    const r = await page.evaluate(d => {
      const sobe = __t.paraNuvem().pausas;
      __t.applyRemote(d);
      const fica = __t.store.pausas;
      return { sobe, fica };
    }, doc);
    expect(r.sobe).toEqual(minhas);
    expect(r.fica, 'campo ausente na nuvem não é lista vazia').toEqual(minhas);
    const outra = await page.evaluate(d => { __t.setUser({ uid: 'u2' }); __t.applyRemote(d); return __t.store.pausas; }, doc);
    expect(outra, 'outra conta no mesmo celular não herda o diário').toBeUndefined();
    await reabrir(page, estadoBase());
    expect(await page.evaluate(() => 'pausas' in __t.paraNuvem())).toBe(false);
  });

  test('a mescla: uma pausa lançada de cada lado entram as duas; mexida de um lado e apagada do outro fica', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => [
      __t.mesclar({ pausas: [] }, { pausas: [{ id: 'a', de: '2026-09-01' }] }, { pausas: [{ id: 'b', de: '2026-09-10' }] }).pausas.map(p => p.id).sort(),
      __t.mesclar({ pausas: [{ id: 'a', de: '2026-09-01' }] }, { pausas: [{ id: 'a', de: '2026-09-01' }] }, {}).pausas.map(p => p.id),
      __t.mesclar({ pausas: [{ id: 'a', de: '2026-09-01' }] }, { pausas: [] }, { pausas: [{ id: 'a', de: '2026-09-01', ate: '2026-09-05' }] }).pausas.map(p => p.ate),
    ]);
    expect(r).toEqual([['a', 'b'], ['a'], ['2026-09-05']]);
  });

  test('a política de privacidade fala das pausas e do motivo de saúde', async ({ page }) => {
    await page.goto('file://' + require('path').join(__dirname, '..', 'privacidade.html'));
    const t = await page.textContent('body');
    expect(t).toMatch(/Pausas do diário de treino/);
    expect(t).toMatch(/Saúde \(lesão, doença\)" é dado de saúde/);
  });
});

test.describe('Telas estreitas', () => {
  for (const largura of [390, 320]) {
    test(`a nota, a linha da série, o Início e o pop-up cabem em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 760 });
      await abrirApp(page, voltaDe(20, { pausas: [
        { id: 'p1', tipo: 'forca', de: diaISO(19), motivo: 'trabalho', nota: 'semana de entrega do projeto final' },
        { id: 'p2', tipo: 'cardio', de: diaISO(25), motivo: '', nota: '' },
      ] }));
      const larg = () => page.evaluate(() => document.documentElement.scrollWidth);
      expect(await larg()).toBeLessThanOrEqual(largura);
      const linhas = await page.evaluate(() => [...document.querySelectorAll('#fdPausas .fd-passos span')].map(s => s.scrollWidth <= s.clientWidth + 1 || getComputedStyle(s).textOverflow === 'ellipsis'));
      expect(linhas).toEqual([true, true]);
      await irTreino(page);
      expect(await larg()).toBeLessThanOrEqual(largura);
      await page.evaluate(() => document.querySelector('#pausaLista [data-pausa="p1"]').click());
      await page.waitForSelector('#pausaOverlay.open');
      expect(await page.evaluate(() => { const m = document.querySelector('#pausaOverlay .modal'); return m.scrollWidth <= m.clientWidth + 1; })).toBe(true);
      await page.evaluate(() => document.getElementById('pausaFechar').click());
      await page.evaluate(() => { __t.store.pausas = []; });
      await page.evaluate(wid => document.querySelector(`#tprotoCards [data-tw="${wid}"]`).click(), 'w1');
      await page.waitForSelector('#trSets .tr-set', { timeout: 10000 });
      await carga(page, 0, 102.5);
      await responder(page, true);
      const caixa = await page.evaluate(() => ['.tr-pausa', '.tsrec'].map(s => { const e = document.querySelector('#trSets ' + s); return e.scrollWidth <= e.clientWidth + 1; }));
      expect(caixa).toEqual([true, true]);
      expect(await larg()).toBeLessThanOrEqual(largura);
    });
  }
});
