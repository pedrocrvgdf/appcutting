/* Academias.

   Nem toda academia tem todos os aparelhos: quem treina em mais de uma monta
   um treino para cada, ou repete o mesmo onde der. Os riscos aqui são três:
   quem nunca cadastrou academia ver o app mudar; a carga de uma academia
   servir de referência na outra sem aviso; e excluir uma academia levar
   treino ou histórico junto. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO, preencherSerie } = require('./app');

const A1 = { id: 'a1', nome: 'Smart Fit' };
const A2 = { id: 'a2', nome: 'Academia do prédio' };

/** Um treino do protocolo, com ou sem academias marcadas. */
const treino = (id, nome, acads) => ({
  id, nome, cat: 'A',
  ex: [{ n: 'Supino reto', s: 2, rest: 90, g: 'peito', sec: [] }],
  ...(acads ? { acads } : {}),
});

/** Uma sessão já registrada, no formato que o app grava. */
const sessao = (id, nome, kg, extra = {}) => ({
  id, name: nome, min: 50, kcal: 300, vol: kg * 10, intens: 'moderada', rir: 2,
  ex: [{ n: 'Supino reto', g: 'peito', sec: [], sets: [{ kg, rep: 10, rir: 2 }] }],
  ...extra,
});

/** Estado com academias, protocolo e, se quiser, a academia já escolhida. */
const estado = ({ academias = [A1, A2], tprotocol, tdays = {}, sel } = {}) => ({
  ...estadoBase({
    academias,
    tprotocol: tprotocol || [treino('w1', 'Treino A')],
    tdays,
  }),
  ...(sel ? { 'tresults.acad': sel } : {}),
});

const irTreino = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForTimeout(250);
};
const cartoes = page => page.evaluate(() =>
  [...document.querySelectorAll('#tprotoCards .proto-card .pcname')].map(e => e.textContent));
const chips = page => page.evaluate(() =>
  [...document.querySelectorAll('#acadBar [data-acad]')].map(b => ({ nome: b.textContent, on: b.classList.contains('on') })));
const escolher = async (page, id) => {
  await page.evaluate(id => document.querySelector(`#acadBar [data-acad="${id}"]`).click(), id);
  await page.waitForTimeout(100);
};
const iniciar = async (page, wid) => {
  await page.evaluate(wid => document.querySelector(`#tprotoCards [data-tw="${wid}"]`).click(), wid);
  await page.waitForSelector('#trSets .tr-set', { timeout: 10000 });
};
const finalizar = async page => {
  await page.evaluate(() => document.getElementById('trNext').click());
  await page.waitForTimeout(400);
};
const hoje = page => page.evaluate(() => (__t.store.tdays || {})[__t.todayKey()] || []);
const confirmar = async page => {
  await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
  await page.evaluate(() => document.getElementById('appDlgOk').click());
  await page.waitForTimeout(200);
};

test.describe('Academias', () => {

  test('sem academia cadastrada, o Treino continua igual e só oferece cadastrar', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await irTreino(page);
    const tela = await page.evaluate(() => ({
      chips: document.querySelectorAll('#acadBar [data-acad]').length,
      convite: document.getElementById('acadPrimeira')?.textContent || '',
      cartoes: document.querySelectorAll('#tprotoCards .proto-card').length,
    }));
    expect(tela.chips, 'sem academia não há o que escolher').toBe(0);
    expect(tela.convite).toMatch(/mais de uma academia/i);
    expect(tela.cartoes).toBe(1);

    // e a sessão sai sem campo de academia, como sempre saiu
    await iniciar(page, 'w1');
    await preencherSerie(page, 0, 60, 10, 1);
    await finalizar(page);   // o treino base tem dois exercícios: vai ao segundo
    await finalizar(page);
    const reg = (await hoje(page))[0];
    expect(reg).toBeTruthy();
    expect('acad' in reg, 'sessão sem academia não ganha campo novo').toBe(false);
    expect(erros).toEqual([]);
  });

  test('cadastrar uma academia já a deixa escolhida', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadPrimeira').click());
    await page.waitForSelector('#acadOverlay.open');
    await page.fill('#acadNome', '  Smart Fit  ');
    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForTimeout(150);

    const r = await page.evaluate(() => ({
      academias: __t.store.academias,
      sel: localStorage.getItem('tresults.acad'),
      campo: document.getElementById('acadNome').value,
      lista: document.getElementById('acadLista').textContent,
    }));
    expect(r.academias.map(a => a.nome)).toEqual(['Smart Fit']);
    expect(r.sel, 'quem cadastra acabou de dizer onde treina').toBe(r.academias[0].id);
    expect(r.campo, 'o campo limpa para a próxima').toBe('');
    expect(r.lista).toMatch(/Smart Fit/);

    await page.evaluate(() => document.getElementById('acadFechar').click());
    await page.waitForTimeout(200);
    expect(await chips(page)).toEqual([
      { nome: 'Todas', on: false },
      { nome: 'Smart Fit', on: true },
    ]);
  });

  test('nome vazio ou repetido não vira academia', async ({ page }) => {
    await abrirApp(page, estado({ academias: [A1] }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');

    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/nome da academia/i);
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(200);

    // maiúscula e acento não fazem outra academia
    await page.fill('#acadNome', 'SMART fit');
    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/já tem/i);
    expect(await page.evaluate(() => __t.store.academias.length)).toBe(1);
  });

  test('cada academia mostra os treinos dela e os que valem em todas', async ({ page }) => {
    const erros = await abrirApp(page, estado({
      tprotocol: [
        treino('w1', 'Treino livre'),               // vale em todas
        treino('w2', 'Pernas no smith', ['a1']),
        treino('w3', 'Pernas com halter', ['a2']),
        treino('w4', 'Costas', ['a1', 'a2']),
      ],
    }));
    await irTreino(page);

    expect(await cartoes(page), '"Todas" mostra tudo').toEqual(['Treino livre', 'Pernas no smith', 'Pernas com halter', 'Costas']);
    await escolher(page, 'a1');
    expect(await cartoes(page)).toEqual(['Treino livre', 'Pernas no smith', 'Costas']);
    await escolher(page, 'a2');
    expect(await cartoes(page)).toEqual(['Treino livre', 'Pernas com halter', 'Costas']);
    expect(await page.evaluate(() => localStorage.getItem('tresults.acad')), 'a escolha fica no aparelho').toBe('a2');
    expect(erros).toEqual([]);
  });

  test('com "Todas", o cartão diz a academia do treino', async ({ page }) => {
    await abrirApp(page, estado({ tprotocol: [treino('w1', 'Treino livre'), treino('w2', 'Pernas no smith', ['a1'])] }));
    await irTreino(page);
    const mac = await page.evaluate(() => [...document.querySelectorAll('#tprotoCards .pcmac')].map(e => e.textContent));
    expect(mac[0]).not.toMatch(/Smart Fit/);
    expect(mac[1]).toMatch(/Smart Fit/);
  });

  test('academia sem treino explica o que fazer, em vez de uma lista vazia', async ({ page }) => {
    await abrirApp(page, estado({ tprotocol: [treino('w2', 'Pernas no smith', ['a1'])], sel: 'a2' }));
    await irTreino(page);
    const vazio = await page.evaluate(() => document.querySelector('#tprotoCards .proto-empty')?.textContent || '');
    expect(vazio).toMatch(/Academia do prédio/);
    expect(vazio).toMatch(/marque esta academia/i);
  });

  test('academia escolhida que não existe mais volta para "Todas"', async ({ page }) => {
    /* Excluída em outro aparelho: escondê-la não pode esconder o protocolo. */
    await abrirApp(page, estado({ academias: [A1], tprotocol: [treino('w1', 'Treino A')], sel: 'sumiu' }));
    await irTreino(page);
    expect((await chips(page)).find(c => c.on).nome).toBe('Todas');
    expect(await cartoes(page)).toEqual(['Treino A']);
  });

  test('treino novo nasce na academia escolhida, e nenhuma marcada vale em todas', async ({ page }) => {
    await abrirApp(page, estado({ sel: 'a1' }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(() => document.getElementById('tpNew').click());
    await page.waitForSelector('#tpEditOverlay.open');

    const marcadas = () => page.evaluate(() =>
      [...document.querySelectorAll('#tpAcads [data-tpacad].on')].map(b => b.dataset.tpacad));
    expect(await marcadas()).toEqual(['a1']);
    expect(await page.textContent('#tpAcadNota')).toMatch(/só nas marcadas/);

    await page.fill('#tpName', 'Pernas no smith');
    await page.fill('#tpExName', 'Agachamento smith');
    await page.evaluate(() => document.getElementById('tpExAdd').click());
    await page.evaluate(() => document.querySelector('#tpAcads [data-tpacad="a2"]').click());
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);

    let w = await page.evaluate(() => __t.store.tprotocol.find(x => x.nome === 'Pernas no smith'));
    expect(w.acads).toEqual(['a1', 'a2']);
    expect(await page.textContent('#tprotoList'), 'a lista do protocolo diz onde cada treino vale').toMatch(/Smart Fit, Academia do prédio/);

    // desmarcando tudo, o treino volta a valer em todas, com a forma de sempre
    await page.evaluate(id => document.querySelector(`#tprotoList [data-ted="${id}"]`).click(), w.id);
    await page.waitForSelector('#tpEditOverlay.open');
    await page.evaluate(() => document.querySelectorAll('#tpAcads [data-tpacad].on').forEach(b => b.click()));
    expect(await page.textContent('#tpAcadNota')).toMatch(/aparece em todas/);
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    w = await page.evaluate(() => __t.store.tprotocol.find(x => x.nome === 'Pernas no smith'));
    expect('acads' in w).toBe(false);
  });

  test('sem academia cadastrada, o editor não mostra o campo', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(() => document.getElementById('tpNew').click());
    await page.waitForSelector('#tpEditOverlay.open');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('tpAcadWrap')).display)).toBe('none');
  });

  test('a sessão grava onde foi feita, e o Início e o Treino dizem', async ({ page }) => {
    const erros = await abrirApp(page, estado({ sel: 'a1' }));
    await irTreino(page);
    await iniciar(page, 'w1');
    expect(await page.textContent('#trProg'), 'o treino em andamento diz onde').toMatch(/Smart Fit/);
    await preencherSerie(page, 0, 60, 10, 1);
    await finalizar(page);

    const reg = (await hoje(page))[0];
    expect(reg.acad).toBe('a1');
    expect(reg.acadNome, 'o nome fica guardado para o histórico').toBe('Smart Fit');
    expect(await page.textContent('#tTodayList')).toMatch(/Smart Fit/);

    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(200);
    expect(await page.textContent('#fdFeed .fd-card .fd-nome .h')).toMatch(/Smart Fit/);
    expect(erros).toEqual([]);
  });

  test('com "Todas", a sessão é da única academia do treino; sem uma só, não se inventa', async ({ page }) => {
    await abrirApp(page, estado({ tprotocol: [treino('w1', 'Treino livre'), treino('w2', 'Pernas no smith', ['a2'])] }));
    expect(await page.evaluate(() => [
      __t.acadDaSessao(__t.store.tprotocol[1]),
      __t.acadDaSessao(__t.store.tprotocol[0]),
    ])).toEqual(['a2', '']);

    await irTreino(page);
    await iniciar(page, 'w1');
    await preencherSerie(page, 0, 60, 10, 1);
    await finalizar(page);
    expect('acad' in (await hoje(page))[0]).toBe(false);
  });

  test('a academia do treino em andamento sobrevive ao app ser descartado', async ({ page, context }) => {
    await abrirApp(page, estado({ sel: 'a2' }));
    await irTreino(page);
    await iniciar(page, 'w1');
    await preencherSerie(page, 0, 60, 10, 1);
    await page.waitForTimeout(600);
    const storage = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
      return o;
    });
    expect(JSON.parse(storage['tresults.run']).acad).toBe('a2');
    // e se a pessoa trocar a escolha enquanto isso, o treino continua sendo onde começou
    storage['tresults.acad'] = 'a1';
    await page.close();

    const nova = await context.newPage();
    await abrirApp(nova, storage);
    await nova.waitForSelector('#trSets .tr-set', { timeout: 10000 });
    expect(await nova.evaluate(() => __t.trS.acad)).toBe('a2');
    await finalizar(nova);
    const reg = (await hoje(nova))[0];
    expect(reg.acad).toBe('a2');
  });

  test('a referência da última vez é a da mesma academia', async ({ page }) => {
    /* O leg press de uma academia não é o da outra. A sessão mais recente é
       da outra academia, e mesmo assim a referência é a desta. */
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: {
        [diaISO(5)]: [sessao('s1', 'Treino A', 60, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a2', acadNome: 'Academia do prédio' })],
      },
    }));
    await irTreino(page);
    await iniciar(page, 'w1');
    const ref = await page.evaluate(() => ({
      ph: document.querySelector('#trSets .ikg').placeholder,
      txt: document.querySelector('#trSets .tsprev .tp-t').textContent,
    }));
    expect(ref.ph).toBe('60');
    expect(ref.txt).toMatch(/^anterior/);
  });

  test('sem histórico nesta academia, usa o da outra e diz de onde veio', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: { [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a2', acadNome: 'Academia do prédio' })] },
    }));
    await irTreino(page);
    await iniciar(page, 'w1');
    const ref = await page.evaluate(() => ({
      ph: document.querySelector('#trSets .ikg').placeholder,
      txt: document.querySelector('#trSets .tsprev .tp-t').textContent,
    }));
    expect(ref.ph).toBe('100');
    expect(ref.txt, 'carga de outra academia precisa dizer de onde veio').toMatch(/^em Academia do prédio/);
  });

  test('histórico de antes das academias continua servindo de referência', async ({ page }) => {
    /* Ao cadastrar a primeira academia, nenhuma sessão antiga tem academia.
       Se elas deixassem de casar, a pessoa perderia a referência inteira. */
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: { [diaISO(3)]: [sessao('s1', 'Treino A', 70)] },
    }));
    await irTreino(page);
    await iniciar(page, 'w1');
    const txt = await page.evaluate(() => document.querySelector('#trSets .tsprev .tp-t').textContent);
    expect(txt).toMatch(/^anterior/);
    expect(await page.evaluate(() => __t.lastExSession('Supino reto', 'a1').sets[0].kg)).toBe(70);
  });

  test('sem academia, a referência é a última de qualquer lugar, como sempre foi', async ({ page }) => {
    await abrirApp(page, estado({
      tdays: {
        [diaISO(5)]: [sessao('s1', 'Treino A', 60, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a2', acadNome: 'Academia do prédio' })],
      },
    }));
    expect(await page.evaluate(() => __t.lastExSession('Supino reto').sets[0].kg)).toBe(100);
    expect(await page.evaluate(() => __t.lastExSession('Supino reto', '').outra)).toBeUndefined();
  });

  test('o selo do feed compara com a mesma academia', async ({ page }) => {
    await abrirApp(page, estado({
      tdays: {
        [diaISO(6)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: 'Smart Fit' })],      // vol 500
        [diaISO(4)]: [sessao('s2', 'Treino A', 80, { acad: 'a2', acadNome: 'Academia do prédio' })], // vol 800
        [diaISO(1)]: [sessao('s3', 'Treino A', 55, { acad: 'a1', acadNome: 'Smart Fit' })],      // vol 550
      },
    }));
    const selos = await page.evaluate(() =>
      [...document.querySelectorAll('#fdFeed .fd-card')].map(c => c.querySelector('.fd-prog')?.textContent.trim()));
    // s3 contra s1 (mesma academia): +10%. Contra s2 daria −31%.
    expect(selos[0]).toBe('+10% de carga');
    // s2 é a primeira na academia do prédio, mas o treino não é novo
    expect(selos[1]).toBe('primeira vez nesta academia');
    expect(selos[2]).toBe('primeira vez deste treino');
  });

  test('a sessão inteira compara exercício a exercício na mesma academia', async ({ page }) => {
    await abrirApp(page, estado({
      tdays: {
        [diaISO(6)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(4)]: [sessao('s2', 'Treino A', 80, { acad: 'a2', acadNome: 'Academia do prédio' })],
        [diaISO(1)]: [sessao('s3', 'Treino A', 55, { acad: 'a1', acadNome: 'Smart Fit' })],
      },
    }));
    await page.evaluate(() => document.querySelector('#fdFeed [data-fdver="s3"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    expect(await page.textContent('#ssSub')).toMatch(/Smart Fit/);
    expect(await page.textContent('#ssCorpo .tp-d'), 'contra os 50 kg da mesma academia, não os 80 da outra').toBe('+5 kg');
  });

  test('renomear a academia muda o nome também no histórico', async ({ page }) => {
    await abrirApp(page, estado({
      academias: [A1],
      tdays: { [diaISO(1)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: 'Smart Fit' })] },
    }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');
    await page.evaluate(() => document.querySelector('[data-acadren="a1"]').click());
    await page.fill('#acadRenIn', 'Smart Fit Asa Sul');
    await page.evaluate(() => document.querySelector('[data-acadok]').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.academias[0].nome)).toBe('Smart Fit Asa Sul');
    await page.evaluate(() => document.getElementById('acadFechar').click());

    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(200);
    expect(await page.textContent('#fdFeed .fd-card .fd-nome .h')).toMatch(/Smart Fit Asa Sul/);
  });

  test('excluir a academia não apaga treino nem histórico', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a1',
      tprotocol: [
        treino('w1', 'Treino livre'),
        treino('w2', 'Pernas no smith', ['a1']),
        treino('w4', 'Costas', ['a1', 'a2']),
      ],
      tdays: { [diaISO(1)]: [sessao('s1', 'Pernas no smith', 50, { acad: 'a1', acadNome: 'Smart Fit' })] },
    }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');
    await page.evaluate(() => document.querySelector('[data-acaddel="a1"]').click());
    expect(await page.textContent('#appDlgMsg')).toMatch(/Nenhum treino é apagado/);
    await confirmar(page);

    const r = await page.evaluate(() => ({
      academias: __t.store.academias.map(a => a.id),
      prot: __t.store.tprotocol.map(w => ({ id: w.id, acads: w.acads })),
      sessao: Object.values(__t.store.tdays)[0][0],
      sel: localStorage.getItem('tresults.acad'),
    }));
    expect(r.academias).toEqual(['a2']);
    expect(r.prot).toEqual([
      { id: 'w1', acads: undefined },
      { id: 'w2', acads: undefined },     // era só dela: passa a valer em todas
      { id: 'w4', acads: ['a2'] },
    ]);
    expect(r.sessao.acadNome, 'o histórico continua dizendo onde foi').toBe('Smart Fit');
    expect(r.sel, 'a escolha que era ela volta para todas').toBeNull();

    await page.evaluate(() => document.getElementById('acadFechar').click());
    await page.waitForTimeout(150);
    expect(await cartoes(page)).toEqual(['Treino livre', 'Pernas no smith', 'Costas']);

    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(200);
    expect(await page.textContent('#fdFeed .fd-card .fd-nome .h')).toMatch(/Smart Fit/);
  });

  test('voltar na confirmação não exclui nada', async ({ page }) => {
    await abrirApp(page, estado());
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');
    await page.evaluate(() => document.querySelector('[data-acaddel="a1"]').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgCancel').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.academias.length)).toBe(2);
  });

  test('sugestão de protocolo entra na academia escolhida', async ({ page }) => {
    await abrirApp(page, estado({ tprotocol: [], sel: 'a2' }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('tSugBtn').click());
    await page.waitForSelector('#tSugOverlay.open');
    await page.evaluate(() => document.querySelector('[data-usesug="ab"]').click());
    await page.waitForTimeout(200);
    const acads = await page.evaluate(() => __t.store.tprotocol.map(w => w.acads));
    expect(acads).toEqual([['a2'], ['a2']]);
  });

  test('as academias sobem para a nuvem e chegam de outro aparelho', async ({ page }) => {
    await abrirApp(page, estado({ academias: [A1] }));
    await page.evaluate(() => { window.__pushes = []; window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); }; });
    await page.evaluate(() => window.__t.pushRemote());
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__pushes.at(-1).academias)).toEqual([A1]);

    await irTreino(page);
    await page.evaluate(([a1, a2]) => {
      const s = JSON.parse(JSON.stringify(__t.store));
      s.academias = [a1, a2];
      __t.applyRemote(s);
    }, [A1, A2]);
    await page.waitForTimeout(150);
    expect((await chips(page)).map(c => c.nome), 'a fileira se atualiza sem trocar de tela').toEqual(['Todas', 'Smart Fit', 'Academia do prédio']);
  });

  test('em 320px, nome comprido de academia não empurra a tela para o lado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const longo = { id: 'a3', nome: 'Academia Corpo em Movimento Unidade Asa Norte' };
    await abrirApp(page, estado({
      academias: [A1, longo], sel: 'a1',
      tdays: { [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a3', acadNome: longo.nome })] },
    }));
    await irTreino(page);
    const largura = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await largura()).toBeLessThanOrEqual(320);
    await iniciar(page, 'w1');
    // a referência de outra academia cabe numa linha, sem despedaçar
    const linha = await page.evaluate(() => {
      const t = document.querySelector('#trSets .tsprev');
      return { alto: t.getBoundingClientRect().height, larg: t.scrollWidth <= t.clientWidth + 1 };
    });
    expect(linha.larg).toBe(true);
    expect(linha.alto).toBeLessThan(40);
    expect(await largura()).toBeLessThanOrEqual(320);
  });
});
