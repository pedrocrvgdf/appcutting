/* Academias.

   Nem toda academia tem todos os aparelhos: quem treina em mais de uma monta
   um treino para cada, ou repete o mesmo onde der. Cada academia é um bloco
   que abre os protocolos dela, e o histórico de carga é por academia (pedido
   do dono: "preservar a realidade do peso daquele aparelho"). Os riscos aqui
   são três: quem nunca cadastrou academia ver o app mudar; a carga de uma
   academia servir de referência na outra; e excluir uma academia levar
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
/** Os blocos das academias: nome e se está aberto. */
const chips = page => page.evaluate(() =>
  [...document.querySelectorAll('#acadBar .acad-cab')].map(b => ({ nome: b.querySelector('.acad-nome').textContent, on: b.getAttribute('aria-expanded') === 'true' })));
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
    expect(await page.textContent('#tprotoCards')).not.toMatch(/academia/i);
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.waitForSelector('#tprotoOverlay.open');
    expect(await page.textContent('#tprotoList'), 'a lista do protocolo não muda para quem não usa academia').not.toMatch(/academia/i);
    await page.evaluate(() => document.getElementById('tpClose').click());
    await page.waitForTimeout(150);

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
    expect(await chips(page)).toEqual([{ nome: 'Smart Fit', on: true }]);
  });

  test('nome vazio ou repetido não vira academia', async ({ page }) => {
    await abrirApp(page, estado({ academias: [A1, A2] }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');

    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/nome da academia/i);
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(200);

    // maiúscula e acento não fazem outra academia
    for (const nome of ['SMART fit', 'academia do predio']) {
      await page.fill('#acadNome', nome);
      await page.evaluate(() => document.getElementById('acadAdd').click());
      await page.waitForSelector('#appDlgOverlay.open');
      expect(await page.textContent('#appDlgMsg')).toMatch(/já tem/i);
      await page.evaluate(() => document.getElementById('appDlgOk').click());
      await page.waitForTimeout(200);
    }
    expect(await page.evaluate(() => __t.store.academias.length)).toBe(2);
  });

  test('cada academia é um bloco que abre os treinos dela e os que valem em todas', async ({ page }) => {
    const erros = await abrirApp(page, estado({
      tprotocol: [
        treino('w1', 'Treino livre'),               // vale em todas
        treino('w2', 'Pernas no smith', ['a1']),
        treino('w3', 'Pernas com halter', ['a2']),
        treino('w4', 'Costas', ['a1', 'a2']),
      ],
    }));
    await irTreino(page);
    // sem escolha guardada nem treino feito: abre a primeira. Não existe mais "Todas".
    expect(await chips(page)).toEqual([{ nome: 'Smart Fit', on: true }, { nome: 'Academia do prédio', on: false }]);
    expect(await cartoes(page)).toEqual(['Treino livre', 'Pernas no smith', 'Costas']);
    expect(await page.evaluate(() => !!document.querySelector('[data-acadbloco="a1"] #tprotoCards')), 'os treinos descem dentro da academia').toBe(true);
    await escolher(page, 'a2');
    expect(await chips(page)).toEqual([{ nome: 'Smart Fit', on: false }, { nome: 'Academia do prédio', on: true }]);
    expect(await cartoes(page)).toEqual(['Treino livre', 'Pernas com halter', 'Costas']);
    expect(await page.evaluate(() => !!document.querySelector('[data-acadbloco="a2"] #tprotoCards'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('tresults.acad')), 'a escolha fica no aparelho').toBe('a2');
    expect(erros).toEqual([]);
  });

  test('o bloco de cada academia diz quantos treinos ela tem', async ({ page }) => {
    await abrirApp(page, estado({ tprotocol: [treino('w1', 'Treino livre'), treino('w2', 'Pernas no smith', ['a1'])] }));
    await irTreino(page);
    const n = await page.evaluate(() => [...document.querySelectorAll('#acadBar .acad-n')].map(e => e.textContent));
    expect(n).toEqual(['2 treinos', '1 treino']);
  });

  test('academia sem treino explica o que fazer e oferece copiar de outra', async ({ page }) => {
    await abrirApp(page, estado({ tprotocol: [treino('w2', 'Pernas no smith', ['a1'])], sel: 'a2' }));
    await irTreino(page);
    const vazio = await page.evaluate(() => document.querySelector('#protLista .proto-empty')?.textContent || '');
    expect(vazio).toMatch(/Academia do prédio/);
    expect(vazio).toMatch(/Copie o protocolo de outra academia/);
    const bt = await page.evaluate(() => ({
      n: document.querySelectorAll('#acadCopiar').length,
      dentro: !!document.querySelector('[data-acadbloco="a2"] #acadCopiar'),
      logoDepois: document.querySelector('#protLista .proto-empty').nextElementSibling?.id,
    }));
    expect(bt, 'logo embaixo da explicação, uma vez só').toEqual({ n: 1, dentro: true, logoDepois: 'acadCopiar' });
    // na Smart Fit não há de onde copiar (o prédio não tem treino): sem botão
    await page.evaluate(() => document.querySelector('#acadBar [data-acad="a1"]').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.querySelectorAll('#acadCopiar').length)).toBe(0);
  });

  test('academia escolhida que não existe mais abre a do último treino, ou a primeira', async ({ page }) => {
    /* Excluída em outro aparelho: escondê-la não pode esconder o protocolo. */
    await abrirApp(page, estado({ academias: [A1, A2], tprotocol: [treino('w1', 'Treino A')], sel: 'sumiu',
      tdays: { [diaISO(2)]: [sessao('s2', 'Treino A', 50, { acad: 'a2', acadNome: A2.nome })] } }));
    await irTreino(page);
    expect((await chips(page)).find(c => c.on).nome).toBe('Academia do prédio');
    expect(await cartoes(page)).toEqual(['Treino A']);
    await page.evaluate(() => { __t.store.tdays = {}; __t.salvar(); });
    expect(await page.evaluate(() => __t.acadSel())).toBe('a1');
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
    expect(await marcadas(), 'reabrir mostra o que estava marcado').toEqual(['a1', 'a2']);
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

  test('o treino iniciado dentro de uma academia é registrado nela, mesmo o que vale em todas', async ({ page }) => {
    await abrirApp(page, estado({ sel: 'a2', tprotocol: [treino('w1', 'Treino livre'), treino('w4', 'Costas', ['a1', 'a2'])] }));
    await irTreino(page);
    await iniciar(page, 'w1');
    await preencherSerie(page, 0, 60, 10, 1);
    await finalizar(page);
    await iniciar(page, 'w4');
    await preencherSerie(page, 0, 60, 10, 1);
    await finalizar(page);
    const [a, b] = await hoje(page);
    expect([a.acad, a.acadNome]).toEqual(['a2', 'Academia do prédio']);
    expect(b.acad, 'treino de duas academias: vale a aberta').toBe('a2');
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
    expect(await page.evaluate(() => !!document.querySelector('#trSets .tr-ref-outra'))).toBe(false);
    await preencherSerie(page, 0, 62.5, 10);
    expect(await page.evaluate(() => document.querySelector('#trSets .tr-set[data-i="0"] .tp-d').textContent)).toBe('+2,5 kg');
  });

  test('sem histórico nesta academia: "Academia nova", sem a carga da outra', async ({ page }) => {
    /* Pedido do dono: a carga de um aparelho não vale no aparelho de outra
       academia. Nem como ponto de partida. */
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: { [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a2', acadNome: 'Academia do prédio' })] },
    }));
    await irTreino(page);
    await iniciar(page, 'w1');
    const r = await page.evaluate(() => ({
      ph: document.querySelector('#trSets .ikg').placeholder,
      ref: !!document.querySelector('#trSets .tsprev'),
      aviso: document.querySelector('#trSets .tr-ref-outra')?.textContent || '',
    }));
    expect(r.ph, 'a carga da outra academia não aparece').toBe('0');
    expect(r.ref).toBe(false);
    expect(r.aviso).toMatch(/Academia nova/);
    expect(r.aviso).toMatch(/Smart Fit/);
    expect(r.aviso).not.toMatch(/100/);
    expect(await page.evaluate(() => __t.lastExSession('Supino reto', 'a1'))).toBeNull();
    // e não há régua: nenhum "−40 kg" contra outro aparelho
    await preencherSerie(page, 0, 60, 10);
    expect(await page.evaluate(() => !!document.querySelector('#trSets .tr-set[data-i="0"] .tp-d'))).toBe(false);
  });

  test('histórico de antes das academias continua servindo de referência', async ({ page }) => {
    /* Ao cadastrar a primeira academia, nenhuma sessão antiga tem academia.
       Se elas deixassem de casar, a pessoa perderia a referência inteira. */
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: {
        [diaISO(5)]: [sessao('s1', 'Treino A', 70)],
        // mais recente, mas de outra academia: não pode passar na frente
        [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a2', acadNome: 'Academia do prédio' })],
      },
    }));
    await irTreino(page);
    await iniciar(page, 'w1');
    const ref = await page.evaluate(() => ({
      ph: document.querySelector('#trSets .ikg').placeholder,
      txt: document.querySelector('#trSets .tsprev .tp-t').textContent,
      aviso: !!document.querySelector('#trSets .tr-ref-outra'),
    }));
    expect(ref.ph).toBe('70');
    expect(ref.txt).toMatch(/^anterior/);
    expect(ref.aviso).toBe(false);
    expect(await page.evaluate(() => __t.lastExSession('Supino reto', 'a1').outra)).toBeUndefined();
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
    expect(selos[1]).toBe('academia nova');
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

  test('editar um treino sem tocar nas academias as mantém', async ({ page }) => {
    /* tpSave remonta o treino do zero: sem carregar acads, trocar uma série
       faria o treino de uma academia aparecer em todas, sem aviso. */
    await abrirApp(page, estado({ tprotocol: [treino('w2', 'Pernas no smith', ['a1'])] }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w2"]').click());
    await page.waitForSelector('#tpEditOverlay.open');
    await page.fill('#tpName', 'Pernas no smith (nova)');
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => __t.store.tprotocol[0]);
    expect(w.nome).toBe('Pernas no smith (nova)');
    expect(w.acads).toEqual(['a1']);
  });

  test('o gráfico de evolução é da academia aberta, com seletor para trocar', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: {
        [diaISO(6)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(4)]: [sessao('s2', 'Treino A', 80, { acad: 'a2', acadNome: 'Academia do prédio' })],
        [diaISO(1)]: [sessao('s3', 'Treino A', 55, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(8)]: [sessao('s0', 'Treino A', 40)],   // de antes das academias: vale em todas
      },
    }));
    await irTreino(page);
    const pontos = () => page.evaluate(() => [...document.querySelectorAll('#evoChart .wt-pt')].length);
    const ult = () => page.evaluate(() => document.querySelector('#evoChart .wt-latest').textContent);
    expect(await page.evaluate(() => document.getElementById('evoAcad').hidden)).toBe(false);
    expect(await page.evaluate(() => document.getElementById('evoAcad').value)).toBe('a1');
    expect(await pontos(), 'Smart Fit: as duas dela e a de antes das academias').toBe(3);
    expect(await ult()).toMatch(/55 kg/);
    await page.evaluate(() => { const s = document.getElementById('evoAcad'); s.value = 'a2'; s.dispatchEvent(new Event('change')); });
    expect(await pontos()).toBe(2);
    expect(await ult()).toMatch(/80 kg/);
    // trocar de academia no Treino leva o gráfico junto
    await page.evaluate(() => { const s = document.getElementById('evoAcad'); s.value = 'a1'; s.dispatchEvent(new Event('change')); });
    await escolher(page, 'a2');
    expect(await page.evaluate(() => document.getElementById('evoAcad').value)).toBe('a2');
    await escolher(page, 'a1');
    expect(await page.evaluate(() => document.getElementById('evoAcad').value)).toBe('a1');
  });

  test('sem academia cadastrada, o gráfico é o de sempre, sem seletor', async ({ page }) => {
    await abrirApp(page, estadoBase({ academias: [], tdays: { [diaISO(1)]: [sessao('s1', 'Treino A', 50, { acad: 'a9', acadNome: 'Velha' })], [diaISO(2)]: [sessao('s2', 'Treino A', 60)] } }));
    await irTreino(page);
    expect(await page.evaluate(() => document.getElementById('evoAcad').hidden)).toBe(true);
    expect(await page.evaluate(() => [...document.querySelectorAll('#evoChart .wt-pt')].length)).toBe(2);
  });

  test('restaurado com outra academia escolhida, a referência continua a de onde o treino começou', async ({ page, context }) => {
    await abrirApp(page, estado({
      sel: 'a2',
      tdays: {
        [diaISO(5)]: [sessao('s1', 'Treino A', 60, { acad: 'a2', acadNome: 'Academia do prédio' })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a1', acadNome: 'Smart Fit' })],
      },
    }));
    await irTreino(page);
    await iniciar(page, 'w1');
    await page.waitForTimeout(500);
    const storage = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
      return o;
    });
    storage['tresults.acad'] = 'a1';
    await page.close();
    const nova = await context.newPage();
    await abrirApp(nova, storage);
    await nova.waitForSelector('#trSets .tr-set', { timeout: 10000 });
    const ref = await nova.evaluate(() => ({
      ph: document.querySelector('#trSets .ikg').placeholder,
      txt: document.querySelector('#trSets .tsprev .tp-t').textContent,
    }));
    expect(ref.ph).toBe('60');
    expect(ref.txt).toMatch(/^anterior/);
  });

  test('histórico de antes das academias continua dando progressão no feed', async ({ page }) => {
    /* Sessão sem academia casa com qualquer uma. Sem isso, ao cadastrar a
       primeira academia, todo treino viraria "primeira vez nesta academia". */
    await abrirApp(page, estado({
      tdays: {
        [diaISO(6)]: [sessao('s1', 'Treino A', 50)],
        [diaISO(1)]: [sessao('s3', 'Treino A', 55, { acad: 'a1', acadNome: 'Smart Fit' })],
      },
    }));
    expect(await page.textContent('#fdFeed .fd-card .fd-prog')).toBe('+10% de carga');
    await page.evaluate(() => document.querySelector('#fdFeed [data-fdver="s3"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    expect(await page.textContent('#ssCorpo .tp-d')).toBe('+5 kg');
  });

  test('treino novo numa academia diz "primeira vez deste treino", não "academia nova"', async ({ page }) => {
    await abrirApp(page, estado({
      tdays: {
        [diaISO(4)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 80, { acad: 'a2', acadNome: 'Academia do prédio' })],
        [diaISO(1)]: [sessao('s3', 'Treino B', 60, { acad: 'a2', acadNome: 'Academia do prédio' })],
      },
    }));
    const selos = await page.evaluate(() =>
      [...document.querySelectorAll('#fdFeed .fd-card')].map(c => c.querySelector('.fd-prog')?.textContent.trim()));
    expect(selos[0]).toBe('primeira vez deste treino');
    expect(selos[1]).toBe('academia nova');
    await page.evaluate(() => document.querySelector('#fdFeed [data-fdver="s2"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    expect(await page.textContent('#ssSelo')).toMatch(/academia nova/);
  });

  test('a sessão inteira compara com a mesma sessão que o selo, mesmo com uma vazia no meio', async ({ page }) => {
    /* Finalizar sem preencher nada grava {vol:0, ex:[]}. O selo pula essa
       sessão; a comparação exercício a exercício precisa pular também. */
    await abrirApp(page, estado({
      tdays: {
        [diaISO(6)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(3)]: [{ id: 's2', name: 'Treino A', min: 5, kcal: 20, vol: 0, intens: 'moderada', rir: null, ex: [], acad: 'a1', acadNome: 'Smart Fit' }],
        [diaISO(1)]: [sessao('s3', 'Treino A', 55, { acad: 'a1', acadNome: 'Smart Fit' })],
      },
    }));
    await page.evaluate(() => document.querySelector('#fdFeed [data-fdver="s3"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    expect(await page.textContent('#ssSelo')).toMatch(/\+10% de carga/);
    expect(await page.textContent('#ssCorpo .tp-d')).toBe('+5 kg');
  });

  test('recadastrar uma academia excluída devolve o histórico dela', async ({ page }) => {
    await abrirApp(page, estado({
      academias: [A2],   // a Smart Fit (a1) foi excluída
      tdays: {
        [diaISO(5)]: [sessao('s1', 'Treino A', 60, { acad: 'a1', acadNome: 'Smart Fit' })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a2', acadNome: 'Academia do prédio' })],
      },
    }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadMais').click());
    await page.waitForSelector('#acadOverlay.open');
    await page.fill('#acadNome', 'smart fit');
    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.academias.map(a => a.id))).toEqual(['a2', 'a1']);
    await page.evaluate(() => document.getElementById('acadFechar').click());
    await page.waitForTimeout(150);
    await iniciar(page, 'w1');
    expect(await page.evaluate(() => document.querySelector('#trSets .ikg').placeholder)).toBe('60');
  });

  test('renomear e tocar em Concluir grava o nome; nome repetido segura o pop-up', async ({ page }) => {
    await abrirApp(page, estado());
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');

    // só a caixa: é a mesma academia, não "nome repetido"
    await page.evaluate(() => document.querySelector('[data-acadren="a1"]').click());
    await page.fill('#acadRenIn', 'SMART FIT');
    await page.evaluate(() => document.querySelector('[data-acadok]').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.getElementById('appDlgOverlay').classList.contains('open'))).toBe(false);
    expect(await page.evaluate(() => __t.store.academias[0].nome)).toBe('SMART FIT');

    // o digitado sobrevive a adicionar outra no meio, e Concluir grava
    await page.evaluate(() => document.querySelector('[data-acadren="a1"]').click());
    await page.fill('#acadRenIn', 'Smart Fit Asa Sul');
    await page.fill('#acadNome', 'Terceira');
    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForTimeout(150);
    expect(await page.inputValue('#acadRenIn')).toBe('Smart Fit Asa Sul');
    await page.evaluate(() => document.getElementById('acadFechar').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.academias.map(a => a.nome))).toEqual(['Smart Fit Asa Sul', 'Academia do prédio', 'Terceira']);

    // nome que já existe: avisa e não fecha
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.waitForSelector('#acadOverlay.open');
    await page.evaluate(() => document.querySelector('[data-acadren="a1"]').click());
    await page.fill('#acadRenIn', 'Terceira');
    await page.evaluate(() => document.getElementById('acadFechar').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('acadOverlay').classList.contains('open'))).toBe(true);
    expect(await page.evaluate(() => __t.store.academias[0].nome)).toBe('Smart Fit Asa Sul');
  });

  test('aparelho com a versão antiga não apaga as academias pela nuvem', async ({ page }) => {
    /* A versão anterior grava o documento inteiro sem o campo. Ausente não é
       "lista vazia"; vazia de verdade (outro aparelho excluiu tudo) vale. */
    await abrirApp(page, estado());
    await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(__t.store));
      delete s.academias;
      __t.applyRemote(s);
    });
    expect(await page.evaluate(() => __t.store.academias.map(a => a.id))).toEqual(['a1', 'a2']);
    await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(__t.store));
      s.academias = [];
      __t.applyRemote(s);
    });
    expect(await page.evaluate(() => __t.store.academias)).toEqual([]);
  });

  test('excluir os dados limpa também a academia escolhida', async ({ page }) => {
    await abrirApp(page, estado({ sel: 'a1' }));
    await page.evaluate(() => __t.setUser(null));   // modo local: sem senha a conferir
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
    await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('pfReset').click());
    await page.waitForSelector('#dangerOverlay.open', { timeout: 5000 });
    await page.evaluate(() => document.getElementById('dgConfirm').click());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => localStorage.getItem('tresults.acad'))).toBeNull();
    expect(await page.evaluate(() => __t.store.academias)).toEqual([]);
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
    expect((await chips(page)).map(c => c.nome), 'os blocos se atualizam sem trocar de tela').toEqual(['Smart Fit', 'Academia do prédio']);
  });

  test('em 320px, nome comprido de academia não empurra a tela para o lado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const longo = { id: 'a3', nome: 'Academia Corpo em Movimento Unidade Asa Norte' };
    await abrirApp(page, estado({
      academias: [A1, longo], sel: 'a3',
      tdays: { [diaISO(2)]: [sessao('s2', 'Treino A', 100, { acad: 'a1', acadNome: A1.nome })] },
    }));
    await irTreino(page);
    const largura = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await largura()).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => { const n = document.querySelector('[data-acadbloco="a3"] .acad-nome'); return n.scrollWidth > n.clientWidth; }), 'o nome comprido ganha reticência').toBe(true);
    await iniciar(page, 'w1');
    // o aviso de academia nova quebra linha dentro da caixa, sem vazar
    const aviso = await page.evaluate(() => { const t = document.querySelector('#trSets .tr-ref-outra'); return t.scrollWidth <= t.clientWidth + 1; });
    expect(aviso).toBe(true);
    expect(await largura()).toBeLessThanOrEqual(320);
  });

  test('copiar o protocolo de outra academia cria uma cópia independente', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a2',
      tprotocol: [treino('w1', 'Treino livre'), treino('w2', 'Pernas no smith', ['a1'])],
      tdays: { [diaISO(2)]: [sessao('s1', 'Pernas no smith', 100, { acad: 'a1', acadNome: A1.nome })] },
    }));
    await irTreino(page);
    expect(await cartoes(page), 'antes: só o que vale em todas').toEqual(['Treino livre']);
    await page.evaluate(() => document.getElementById('acadCopiar').click());
    await page.waitForSelector('#copiaOverlay.open');
    expect(await page.textContent('#copiaLista')).toMatch(/2 treinos · da Smart Fit/);
    await page.evaluate(() => document.querySelector('#copiaLista [data-copia="0"]').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/independente/);
    await confirmar(page);

    const r = await page.evaluate(() => __t.store.tprotocol.map(w => ({ id: w.id, nome: w.nome, acads: w.acads, ex: w.ex.map(e => e.n) })));
    const orig = r.filter(w => w.id === 'w1' || w.id === 'w2'), copias = r.filter(w => w.id !== 'w1' && w.id !== 'w2');
    expect(orig).toEqual([
      { id: 'w1', nome: 'Treino livre', acads: ['a1'], ex: ['Supino reto'] },   // valia em todas: a do prédio tem o seu agora
      { id: 'w2', nome: 'Pernas no smith', acads: ['a1'], ex: ['Supino reto'] },
    ]);
    expect(copias.map(w => [w.nome, w.acads])).toEqual([['Treino livre', ['a2']], ['Pernas no smith', ['a2']]]);
    expect(await cartoes(page), 'a academia passa a ter as cópias').toEqual(['Treino livre', 'Pernas no smith']);
    await escolher(page, 'a1');
    expect(await cartoes(page), 'e a de origem continua com os dela').toEqual(['Treino livre', 'Pernas no smith']);

    // independente: mudar a cópia não muda o original
    await escolher(page, 'a2');
    const idCopia = copias.find(w => w.nome === 'Pernas no smith').id;
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(id => document.querySelector(`#tprotoList [data-ted="${id}"]`).click(), idCopia);
    await page.waitForSelector('#tpEditOverlay.open');
    await page.fill('#tpName', 'Pernas com halter');
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.tprotocol.find(w => w.id === 'w2').nome)).toBe('Pernas no smith');
    await page.evaluate(() => document.getElementById('tpClose').click());
    await page.waitForTimeout(150);

    // e a carga começa do zero na academia nova
    await iniciar(page, idCopia);
    expect(await page.evaluate(() => document.querySelector('#trSets .ikg').placeholder)).toBe('0');
    expect(await page.textContent('#trSets .tr-ref-outra')).toMatch(/Academia nova/);
  });

  test('copiar um treino que já valia aqui: o já feito aqui continua comparável, sem reescrever o histórico, e nome repetido é avisado', async ({ page }) => {
    /* "Treino A" valia nas duas e já foi feito no prédio (50 kg). Copiado da
       Smart Fit para o prédio, a cópia é o mesmo treino para o histórico
       (origem), e as academias continuam separadas: a próxima sessão da
       cópia compara com os 50 kg do prédio, não com os 80 da Smart Fit. Nada
       do passado é regravado. A mensagem não promete "carga do zero", que
       aqui seria falso. */
    await abrirApp(page, estado({
      sel: 'a2',
      tprotocol: [treino('w1', 'Treino A'), treino('w2', 'Treino A', ['a2'])],
      tdays: {
        [diaISO(3)]: [sessao('s1', 'Treino A', 50, { tid: 'w1', acad: 'a2', acadNome: A2.nome })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 80, { tid: 'w1', acad: 'a1', acadNome: A1.nome })],
      },
    }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadCopiar').click());
    await page.waitForSelector('#copiaOverlay.open');
    await page.evaluate(() => document.querySelector('#copiaLista [data-copia="0"]').click());
    await page.waitForSelector('#appDlgOverlay.open');
    const msg = await page.textContent('#appDlgMsg');
    expect(msg).not.toMatch(/do zero/);
    expect(msg).toMatch(/vem só do que você levantou lá/);
    expect(msg, 'o "Treino A" que só o prédio tem fica ao lado').toMatch(/já tem “Treino A” neste protocolo; a cópia fica ao lado/);
    await confirmar(page);

    const r = await page.evaluate(() => {
      const ws = __t.store.tprotocol, c = ws.find(w => !['w1', 'w2'].includes(w.id));
      const tds = __t.store.tdays, s = id => Object.values(tds).flat().find(x => x.id === id);
      return { copia: c.id, origem: c.origem, acadsW1: ws.find(w => w.id === 'w1').acads, s1: s('s1').tid, s2: s('s2').tid };
    });
    expect(r.acadsW1).toEqual(['a1']);
    expect(r.origem, 'a cópia sabe de onde veio').toBe('w1');
    expect([r.s1, r.s2], 'o histórico não é reescrito').toEqual(['w1', 'w1']);

    // a próxima sessão da cópia compara com os 50 kg do prédio
    await iniciar(page, r.copia);
    expect(await page.evaluate(() => document.querySelector('#trSets .ikg').placeholder)).toBe('50');
    await preencherSerie(page, 0, 55, 10, 1);
    await finalizar(page);
    const selo = await page.evaluate(() => document.querySelector('#fdFeed .fd-card .fd-prog')?.textContent.trim());
    expect(selo).toBe('+10% de carga');
  });

  /** Copia o primeiro protocolo oferecido para a academia aberta e devolve o id da cópia. */
  const copiarPrimeiro = async page => {
    await page.evaluate(() => document.getElementById('acadCopiar').click());
    await page.waitForSelector('#copiaOverlay.open');
    await page.evaluate(() => document.querySelector('#copiaLista [data-copia="0"]').click());
    await confirmar(page);
    return page.evaluate(() => __t.store.tprotocol.find(w => w.origem).id);
  };
  const seloHoje = page => page.evaluate(() => document.querySelector('#fdFeed .fd-card .fd-prog')?.textContent.trim());

  test('a primeira sessão da cópia diz "academia nova" quando o original só foi feito na outra', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a2', tprotocol: [treino('w1', 'Treino A', ['a1'])],
      tdays: { [diaISO(3)]: [sessao('s1', 'Treino A', 80, { tid: 'w1', acad: 'a1', acadNome: A1.nome })] },
    }));
    await irTreino(page);
    const copia = await copiarPrimeiro(page);
    await iniciar(page, copia);
    expect(await page.textContent('#trSets .tr-ref-outra')).toMatch(/Academia nova/);
    await preencherSerie(page, 0, 60, 10, 1);
    await finalizar(page);
    expect(await seloHoje(page), 'nunca "primeira vez deste treino" para um treino já feito').toBe('academia nova');
  });

  test('cópia de treino com histórico de antes das academias: o feed compara com ele, como a tela do treino', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a2', tprotocol: [treino('w1', 'Treino A', ['a1'])],
      tdays: { [diaISO(3)]: [sessao('s0', 'Treino A', 50, { tid: 'w1' })] },   // sem academia: vale em todas
    }));
    await irTreino(page);
    const copia = await copiarPrimeiro(page);
    await iniciar(page, copia);
    expect(await page.evaluate(() => document.querySelector('#trSets .ikg').placeholder)).toBe('50');
    await preencherSerie(page, 0, 55, 10, 1);
    await finalizar(page);
    expect(await seloHoje(page)).toBe('+10% de carga');
  });

  test('renomear a cópia não leva o histórico antigo (sem tid) da outra academia', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a2', tprotocol: [treino('w1', 'Treino A', ['a1'])],
      tdays: { [diaISO(4)]: [sessao('s1', 'Treino A', 50, { acad: 'a1', acadNome: A1.nome })] },   // antes do tid
    }));
    await irTreino(page);
    const copia = await copiarPrimeiro(page);
    expect(await page.evaluate(() => Object.values(__t.store.tdays).flat().find(x => x.id === 's1').tid), 'é do original, antes de a cópia nascer').toBe('w1');
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(id => document.querySelector(`#tprotoList [data-ted="${id}"]`).click(), copia);
    await page.waitForSelector('#tpEditOverlay.open');
    await page.fill('#tpName', 'Treino A prédio');
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('tpClose').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => Object.values(__t.store.tdays).flat().find(x => x.id === 's1').tid)).toBe('w1');
    // na Smart Fit, o original continua comparando com os 50 kg
    await escolher(page, 'a1');
    await iniciar(page, 'w1');
    await preencherSerie(page, 0, 55, 10, 1);
    await finalizar(page);
    expect(await seloHoje(page)).toBe('+10% de carga');
  });

  test('duas cópias do mesmo treino na mesma academia são dois treinos: a editada não compara com a irmã', async ({ page }) => {
    /* As duas nasceram do mesmo original (mesma raiz), mas convivem no
       prédio. A segunda foi editada para outros exercícios: comparar com a
       primeira daria "-60% de carga", um número inventado. Com o original,
       que só vive na Smart Fit, a ligação continua: "academia nova". */
    await abrirApp(page, estado({
      sel: 'a2',
      tprotocol: [
        treino('w1', 'Treino A', ['a1']),
        { ...treino('c1', 'Treino A', ['a2']), origem: 'w1' },
        { ...treino('c2', 'Treino A leve', ['a2']), origem: 'w1' },
      ],
      tdays: {
        [diaISO(5)]: [sessao('s0', 'Treino A', 80, { tid: 'w1', acad: 'a1', acadNome: A1.nome })],
        [diaISO(3)]: [sessao('s1', 'Treino A', 50, { tid: 'c1', acad: 'a2', acadNome: A2.nome })],
        [diaISO(1)]: [sessao('s2', 'Treino A leve', 20, { tid: 'c2', acad: 'a2', acadNome: A2.nome })],
      },
    }));
    const selos = await page.evaluate(() => [...document.querySelectorAll('#fdFeed .fd-card')].map(c => c.querySelector('.fd-prog')?.textContent.trim()));
    expect(selos).toEqual(['academia nova', 'academia nova', 'primeira vez deste treino']);
    expect(await page.evaluate(() => [__t.mesmoTreino({ tid: 'c1' }, { tid: 'c2' }), __t.mesmoTreino({ tid: 'c1' }, { tid: 'w1' })])).toEqual([false, true]);
  });

  test('renomear um treino não carimba sessões antigas quando outro, sem parentesco, tem o mesmo nome', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a1', tprotocol: [treino('w1', 'Treino A', ['a1']), treino('w2', 'Treino A', ['a2'])],
      tdays: { [diaISO(4)]: [sessao('s1', 'Treino A', 50, { acad: 'a2', acadNome: A2.nome })] },
    }));
    await page.evaluate(() => { const w = __t.store.tprotocol.find(x => x.id === 'w1'); __t.carimbarTid(w); });
    expect(await page.evaluate(() => Object.values(__t.store.tdays).flat().find(x => x.id === 's1').tid), 'não dá para saber de qual dos dois é').toBeUndefined();
  });

  test('depois de copiar a partir da academia vazia, o botão "Copiar" continua funcionando', async ({ page }) => {
    await abrirApp(page, {
      ...estadoBase({
        academias: [A1, A2],
        tprotos: [{ id: 'principal', nome: 'Hipertrofia' }, { id: 'p2', nome: 'Viagem' }],
        tprotocol: [treino('w1', 'Treino A', ['a1']), { ...treino('w3', 'Hotel', ['a1']), prot: 'p2', protNome: 'Viagem' }],
      }),
      'tresults.acad': 'a2',
    });
    await irTreino(page);
    expect(await page.evaluate(() => !!document.querySelector('#protLista .proto-empty'))).toBe(true);
    await copiarPrimeiro(page);
    expect(await page.evaluate(() => document.querySelectorAll('#acadCopiar').length), 'um botão só na página').toBe(1);
    await page.evaluate(() => document.getElementById('acadCopiar').click());
    await page.waitForSelector('#copiaOverlay.open', { timeout: 3000 });
  });

  test('a sugestão preenche o protocolo que aparece aberto na academia, e não o lembrado de outra', async ({ page }) => {
    await abrirApp(page, {
      ...estadoBase({
        academias: [A1, A2],
        tprotos: [{ id: 'principal', nome: 'Hipertrofia' }, { id: 'p2', nome: 'Viagem' }],
        tprotocol: [treino('w1', 'Treino A', ['a1'])],
      }),
      'tresults.acad': 'a2', 'tresults.prot': 'principal',
    });
    await irTreino(page);
    expect(await page.evaluate(() => [...document.querySelectorAll('#protLista .prot-bloco.aberto .prot-nome')].map(e => e.textContent))).toEqual(['Viagem']);
    await page.evaluate(() => document.getElementById('tSugBtn').click());
    await page.waitForSelector('#tSugOverlay.open');
    expect(await page.textContent('[data-usesug="abc"]')).toMatch(/Colocar em “Viagem”/);
  });

  test('o histórico de uma academia excluída continua no gráfico', async ({ page }) => {
    await abrirApp(page, estado({
      sel: 'a1',
      tdays: {
        [diaISO(9)]: [sessao('v1', 'Treino A', 60, { acad: 'a9', acadNome: 'Academia antiga' })],
        [diaISO(6)]: [sessao('v2', 'Treino A', 70, { acad: 'a9', acadNome: 'Academia antiga' })],
        [diaISO(2)]: [sessao('n1', 'Treino A', 40, { acad: 'a1', acadNome: A1.nome })],
      },
    }));
    await irTreino(page);
    const ops = await page.evaluate(() => [...document.querySelectorAll('#evoAcad option')].map(o => [o.value, o.textContent]));
    expect(ops).toEqual([['a1', 'Smart Fit'], ['a2', 'Academia do prédio'], ['a9', 'Academia antiga (excluída)']]);
    await page.evaluate(() => { const s = document.getElementById('evoAcad'); s.value = 'a9'; s.dispatchEvent(new Event('change')); });
    expect(await page.evaluate(() => document.querySelectorAll('#evoChart .wt-pt').length)).toBe(2);
    expect(await page.evaluate(() => document.getElementById('evoAcad').value)).toBe('a9');
  });

  test('em 320px, o nome da academia no feed não passa por cima da seta', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const longo = { id: 'a3', nome: 'Academia Corpo em Movimento Unidade Asa Norte' };
    await abrirApp(page, estado({
      academias: [A1, A2, longo],
      tdays: {
        [diaISO(1)]: [sessao('s1', 'Treino A', 50, { acad: 'a3', acadNome: longo.nome })],
        [diaISO(2)]: [sessao('s2', 'Treino A', 50, { acad: 'a2', acadNome: A2.nome })],
      },
    }));
    const r = await page.evaluate(() => ({
      larg: document.documentElement.scrollWidth,
      cartoes: [...document.querySelectorAll('#fdFeed .fd-card')].map(c => ({
        fimH: c.querySelector('.fd-nome .h').getBoundingClientRect().right,
        chev: c.querySelector('.chev').getBoundingClientRect().left,
      })),
    }));
    expect(r.larg).toBeLessThanOrEqual(320);
    for (const c of r.cartoes) expect(c.fimH).toBeLessThanOrEqual(c.chev);
  });
});
