/* Protocolos com nome.

   A pessoa pode ter mais de um protocolo ("Hipertrofia", "Viagem"), cada um
   com os seus treinos. Os riscos: quem já usava o app ver os dados mudarem
   de forma sem ter mexido; dois "Treino A" de protocolos diferentes serem
   comparados no selo de progressão; e um aparelho com a versão anterior
   tirar treinos do protocolo pela nuvem. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO, preencherSerie } = require('./app');

const ex = (n, g = 'peito') => ({ n, s: 2, rest: 90, g, sec: [] });
const treino = (id, nome, extra = {}) => ({ id, nome, cat: 'A', ex: [ex('Supino reto')], ...extra });
const sessao = (id, nome, vol, extra = {}) => ({
  id, name: nome, min: 50, kcal: 300, vol, intens: 'moderada', rir: 2,
  ex: [{ n: 'Supino reto', g: 'peito', sec: [], sets: [{ kg: vol / 10, rep: 10, rir: 2 }] }],
  ...extra,
});
const doisProtocolos = (extra = {}) => estadoBase({
  tprotos: [{ id: 'principal', nome: 'Hipertrofia' }, { id: 'p2', nome: 'Viagem' }],
  tprotocol: [
    treino('w1', 'Treino A'),
    treino('w2', 'Treino B'),
    treino('w3', 'Treino A', { prot: 'p2', protNome: 'Viagem', ex: [ex('Flexão de braço')] }),
  ],
  ...extra,
});

const irTreino = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForTimeout(250);
};
const blocos = page => page.evaluate(() => [...document.querySelectorAll('#protLista .prot-bloco')].map(b => ({
  nome: b.querySelector('.prot-nome').textContent,
  n: b.querySelector('.prot-n').textContent,
  aberto: b.classList.contains('aberto'),
  seta: !!b.querySelector('button.prot-cab'),
})));
const cartoes = page => page.evaluate(() => [...document.querySelectorAll('#tprotoCards .pcname')].map(e => e.textContent));
const capturar = page => page.evaluate(() => {
  window.__pushes = [];
  window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); };
});
const gravado = async page => {
  await page.evaluate(() => window.__t.pushRemote());
  await page.waitForTimeout(80);
  return page.evaluate(() => window.__pushes.at(-1));
};
const abrirProtocolo = async page => {
  await page.evaluate(() => document.getElementById('tOpenProtocol').click());
  await page.waitForSelector('#tprotoOverlay.open');
};
const confirmar = async page => {
  await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
  await page.evaluate(() => document.getElementById('appDlgOk').click());
  await page.waitForTimeout(200);
};
const criar = async (page, nome) => {
  await page.evaluate(() => document.getElementById('protNovo').click());
  await page.waitForSelector('#protNovoOverlay.open');
  await page.fill('#protNovoNome', nome);
  await page.evaluate(() => document.getElementById('protNovoOk').click());
  await page.waitForTimeout(250);
};

test.describe('Protocolos', () => {

  test('quem já usa o app vê "Meu protocolo" com os treinos de sempre, e abrir não grava nada', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await capturar(page);
    await irTreino(page);
    expect(await blocos(page)).toEqual([{ nome: 'Meu protocolo', n: '1 treino', aberto: true, seta: false }]);
    expect(await cartoes(page)).toEqual(['Treino A']);
    const d = await gravado(page);
    expect('tprotos' in d, 'abrir o app não materializa a lista').toBe(false);
    expect('prot' in d.tprotocol[0]).toBe(false);
    expect(erros).toEqual([]);
  });

  test('editar um treino com um protocolo só não muda a forma dos dados', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await abrirProtocolo(page);
    await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w1"]').click());
    await page.waitForSelector('#tpEditOverlay.open');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('tpProtWrap')).display), 'com um protocolo só, o editor não pergunta').toBe('none');
    await page.fill('#tpName', 'Treino A2');
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => ({ w: __t.store.tprotocol[0], tp: __t.store.tprotos }));
    expect(s.w.nome).toBe('Treino A2');
    expect('prot' in s.w).toBe(false);
    expect(s.tp).toBeUndefined();
  });

  test('criar protocolo pede o nome; sem nome, ou com "Voltar", nada é criado', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await page.evaluate(() => document.getElementById('protNovo').click());
    await page.waitForSelector('#protNovoOverlay.open');
    await page.evaluate(() => document.getElementById('protNovoOk').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/nome do protocolo/i);
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(150);
    await page.fill('#protNovoNome', 'Viagem');
    await page.evaluate(() => document.getElementById('protNovoVoltar').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome))).toEqual(['Meu protocolo']);
  });

  test('nome repetido (outra caixa, sem acento) não vira protocolo', async ({ page }) => {
    await abrirApp(page, doisProtocolos());
    await irTreino(page);
    await page.evaluate(() => document.getElementById('protNovo').click());
    await page.fill('#protNovoNome', 'VIAGÉM');
    await page.evaluate(() => document.getElementById('protNovoOk').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/já tem um protocolo/i);
    expect(await page.evaluate(() => __t.listaProtocolos().length)).toBe(2);
  });

  test('criar o segundo guarda o primeiro como "Meu protocolo" e abre o novo, vazio', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await criar(page, 'Viagem');
    const r = await page.evaluate(() => ({
      tp: __t.store.tprotos.map(p => p.nome),
      ids: __t.store.tprotos.map(p => p.id),
      aberto: localStorage.getItem('tresults.prot'),
      popup: document.getElementById('tprotoOverlay').classList.contains('open'),
      titulo: document.getElementById('tpProtNome').value,
      lista: document.getElementById('tprotoList').textContent,
      sug: getComputedStyle(document.getElementById('tpSugAqui')).display,
    }));
    expect(r.tp).toEqual(['Meu protocolo', 'Viagem']);
    expect(r.ids[0]).toBe('principal');
    expect(r.aberto).toBe(r.ids[1]);
    expect(r.popup).toBe(true);
    expect(r.titulo).toBe('Viagem');
    expect(r.lista).toMatch(/Nenhum treino/);
    expect(r.sug, 'protocolo vazio oferece preencher com uma sugestão').not.toBe('none');
  });

  test('quem começa do zero e cria o primeiro protocolo não ganha um "Meu protocolo" vazio', async ({ page }) => {
    await abrirApp(page, estadoBase({ tprotocol: [] }));
    await irTreino(page);
    await criar(page, 'Hipertrofia');
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome))).toEqual(['Hipertrofia']);
  });

  test('a aba mostra um bloco por protocolo, um aberto, e tocar abre outro; a escolha sobrevive a recarregar', async ({ page }) => {
    await abrirApp(page, doisProtocolos());
    await irTreino(page);
    expect(await blocos(page)).toEqual([
      { nome: 'Hipertrofia', n: '2 treinos', aberto: true, seta: true },
      { nome: 'Viagem', n: '1 treino', aberto: false, seta: true },
    ]);
    expect(await cartoes(page)).toEqual(['Treino A', 'Treino B']);
    await page.evaluate(() => document.querySelector('[data-protabrir="p2"]').click());
    await page.waitForTimeout(150);
    expect((await blocos(page)).map(b => b.aberto)).toEqual([false, true]);
    expect(await cartoes(page)).toEqual(['Treino A']);
    expect(await page.textContent('#tOpenProtocol')).toMatch(/Editar.*Viagem/);

    await page.reload();
    await page.waitForFunction(() => !!window.__t);
    await irTreino(page);
    expect((await blocos(page)).map(b => b.aberto)).toEqual([false, true]);
  });

  test('sem escolha guardada, abre no protocolo da última sessão; escolha que sumiu cai no primeiro', async ({ page }) => {
    await abrirApp(page, {
      ...doisProtocolos({ tdays: { [diaISO(1)]: [sessao('s1', 'Treino A', 1000, { tid: 'w3', prot: 'p2' })] } }),
      'tresults.prot': 'sumiu',
    });
    await irTreino(page);
    expect((await blocos(page)).map(b => b.aberto)).toEqual([false, true]);
    await page.evaluate(() => localStorage.removeItem('tresults.prot'));
    expect(await page.evaluate(() => __t.protAberto())).toBe('p2');
  });

  test('renomear pelo título grava no Concluir e carimba os treinos; nome repetido segura o pop-up', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await abrirProtocolo(page);
    await page.fill('#tpProtNome', 'Hipertrofia');
    await page.evaluate(() => document.getElementById('tpClose').click());
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => ({ tp: __t.store.tprotos, w: __t.store.tprotocol[0] }));
    expect(s.tp).toEqual([{ id: 'principal', nome: 'Hipertrofia' }]);
    expect([s.w.prot, s.w.protNome]).toEqual(['principal', 'Hipertrofia']);
    expect((await blocos(page))[0].nome).toBe('Hipertrofia');

    await criar(page, 'Viagem');
    await page.fill('#tpProtNome', 'hipertrofia');
    await page.evaluate(() => document.getElementById('tpClose').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.getElementById('tprotoOverlay').classList.contains('open'))).toBe(true);
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome))).toEqual(['Hipertrofia', 'Viagem']);
  });

  test('abrir e fechar o protocolo sem mudar o nome não grava nada', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await abrirProtocolo(page);
    await page.evaluate(() => document.getElementById('tpClose').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.tprotos)).toBeUndefined();
  });

  test('treino novo nasce no protocolo aberto e na academia escolhida', async ({ page }) => {
    await abrirApp(page, {
      ...doisProtocolos({ academias: [{ id: 'a1', nome: 'Smart Fit' }] }),
      'tresults.prot': 'p2', 'tresults.acad': 'a1',
    });
    await irTreino(page);
    await abrirProtocolo(page);
    await page.evaluate(() => document.getElementById('tpNew').click());
    await page.waitForSelector('#tpEditOverlay.open');
    expect(await page.evaluate(() => [...document.querySelectorAll('#tpProts .on')].map(b => b.dataset.tpprot))).toEqual(['p2']);
    await page.fill('#tpName', 'Hotel');
    await page.fill('#tpExName', 'Agachamento com peso corporal');
    await page.evaluate(() => document.getElementById('tpExAdd').click());
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => __t.store.tprotocol.find(x => x.nome === 'Hotel'));
    expect([w.prot, w.protNome, w.acads]).toEqual(['p2', 'Viagem', ['a1']]);
  });

  test('mover um treino de protocolo pelo editor mantém as academias e avisa', async ({ page }) => {
    await abrirApp(page, doisProtocolos({
      academias: [{ id: 'a1', nome: 'Smart Fit' }],
      tprotocol: [treino('w1', 'Treino A', { acads: ['a1'] }), treino('w3', 'Hotel', { prot: 'p2', protNome: 'Viagem' })],
    }));
    await irTreino(page);
    await abrirProtocolo(page);
    await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w1"]').click());
    await page.waitForSelector('#tpEditOverlay.open');
    await page.evaluate(() => document.querySelector('#tpProts [data-tpprot="p2"]').click());
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForTimeout(200);
    const w = await page.evaluate(() => __t.store.tprotocol.find(x => x.id === 'w1'));
    expect([w.prot, w.protNome, w.acads]).toEqual(['p2', 'Viagem', ['a1']]);
    expect(await page.textContent('#tprotoList'), 'sai da lista do protocolo aberto').not.toMatch(/Treino A/);
  });

  test('excluir protocolo apaga só os treinos dele; histórico e o outro protocolo ficam; "Voltar" não exclui', async ({ page }) => {
    await abrirApp(page, {
      ...doisProtocolos({ tdays: { [diaISO(1)]: [sessao('s1', 'Treino A', 1000, { tid: 'w3', prot: 'p2', protNome: 'Viagem' })] } }),
      'tresults.prot': 'p2',
    });
    await irTreino(page);
    await abrirProtocolo(page);
    await page.evaluate(() => document.getElementById('tpProtDel').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/Excluir o protocolo "Viagem" e o treino dele\? As sessões que você já fez continuam/);
    await page.evaluate(() => document.getElementById('appDlgCancel').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __t.store.tprotocol.length)).toBe(3);

    await page.evaluate(() => document.getElementById('tpProtDel').click());
    await confirmar(page);
    const r = await page.evaluate(() => ({
      treinos: __t.store.tprotocol.map(w => w.id),
      lista: __t.listaProtocolos().map(p => p.nome),
      sessao: Object.values(__t.store.tdays)[0][0].protNome,
      escolha: localStorage.getItem('tresults.prot'),
    }));
    expect(r.treinos).toEqual(['w1', 'w2']);
    expect(r.lista).toEqual(['Hipertrofia']);
    expect(r.sessao).toBe('Viagem');
    expect(r.escolha).toBeNull();
    // o feed continua dizendo de que protocolo foi a sessão, que não existe mais
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await page.waitForTimeout(200);
    expect(await page.textContent('#fdFeed .fd-card .h')).toMatch(/^Viagem · /);
  });

  test('com um protocolo só, não existe "Excluir este protocolo"', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    await abrirProtocolo(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('tpProtDel')).display)).toBe('none');
  });

  test('sugestão com o protocolo aberto vazio o preenche; com treinos, vira protocolo novo, e "Nome 2" se repetir', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irTreino(page);
    const usar = async id => {
      await page.evaluate(() => document.getElementById('tSugBtn').click());
      await page.waitForSelector('#tSugOverlay.open');
      await page.evaluate(id => document.querySelector(`[data-usesug="${id}"]`).click(), id);
      await page.waitForTimeout(200);
    };
    await usar('ab');
    await usar('ab');
    const lista = await page.evaluate(() => __t.listaProtocolos().map(p => p.nome));
    expect(lista).toEqual(['Meu protocolo', 'Full body A/B', 'Full body A/B 2']);
    const r = await page.evaluate(() => ({
      principal: __t.treinosDoProt('principal').map(w => w.nome),
      aberto: __t.protPorId(__t.protAberto()).nome,
    }));
    expect(r.principal).toEqual(['Treino A']);
    expect(r.aberto).toBe('Full body A/B 2');

    // o protocolo novo e vazio é preenchido pela sugestão, sem virar outro
    await criar(page, 'Casa');
    await page.evaluate(() => document.getElementById('tpSugAqui').click());
    await page.waitForSelector('#tSugOverlay.open');
    expect(await page.textContent('[data-usesug="abc"]')).toMatch(/Colocar em “Casa”/);
    await page.evaluate(() => document.querySelector('[data-usesug="abc"]').click());
    await page.waitForTimeout(200);
    const casa = await page.evaluate(() => __t.treinosDoProt(__t.listaProtocolos().find(p => p.nome === 'Casa').id).length);
    expect(casa).toBe(3);
    expect(await page.evaluate(() => __t.listaProtocolos().length)).toBe(4);
  });

  test('o filtro de academia vale dentro do protocolo aberto, e o bloco não some', async ({ page }) => {
    await abrirApp(page, {
      ...doisProtocolos({
        academias: [{ id: 'a1', nome: 'Smart Fit' }, { id: 'a2', nome: 'Prédio' }],
        tprotocol: [treino('w1', 'Treino A', { acads: ['a1'] }), treino('w3', 'Hotel', { prot: 'p2', protNome: 'Viagem' })],
      }),
      'tresults.acad': 'a2',
    });
    await irTreino(page);
    expect(await blocos(page)).toEqual([
      { nome: 'Hipertrofia', n: 'nenhum para esta academia', aberto: true, seta: true },
      { nome: 'Viagem', n: '1 treino', aberto: false, seta: true },
    ]);
    expect(await page.textContent('#tprotoCards .proto-empty')).toMatch(/Nenhum treino de Hipertrofia marcado para Prédio.*marque esta academia/);
  });

  test('dois protocolos com "Treino A": o selo compara cada um só com o seu', async ({ page }) => {
    await abrirApp(page, doisProtocolos({
      tdays: {
        [diaISO(6)]: [sessao('s1', 'Treino A', 500)],                                  // antes dos protocolos: é do principal
        [diaISO(4)]: [sessao('s2', 'Treino A', 800, { tid: 'w3', prot: 'p2' })],
        [diaISO(1)]: [sessao('s3', 'Treino A', 550, { tid: 'w1', prot: 'principal' })],
      },
    }));
    const selos = await page.evaluate(() => [...document.querySelectorAll('#fdFeed .fd-card')].map(c => c.querySelector('.fd-prog')?.textContent.trim()));
    expect(selos).toEqual(['+10% de carga', 'primeira vez deste treino', 'primeira vez deste treino']);
    await page.evaluate(() => document.querySelector('#fdFeed [data-fdver="s3"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    expect(await page.textContent('#ssCorpo .tp-d'), 'contra os 50 kg do mesmo protocolo, não os 80 do outro').toBe('+5 kg');
  });

  test('renomear o treino não quebra a progressão (mesmo tid)', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tprotocol: [treino('w1', 'Peito e tríceps')],
      tdays: {
        [diaISO(4)]: [sessao('s1', 'Treino A', 500, { tid: 'w1', prot: 'principal' })],
        [diaISO(1)]: [sessao('s2', 'Peito e tríceps', 600, { tid: 'w1', prot: 'principal' })],
      },
    }));
    expect(await page.textContent('#fdFeed .fd-card .fd-prog')).toBe('+20% de carga');
  });

  test('a sessão grava tid, prot e protNome, e sobrevive ao app ser descartado', async ({ page, context }) => {
    await abrirApp(page, { ...doisProtocolos(), 'tresults.prot': 'p2' });
    await irTreino(page);
    await page.evaluate(() => document.querySelector('#tprotoCards [data-tw="w3"]').click());
    await page.waitForSelector('#trSets .tr-set');
    await preencherSerie(page, 0, 0, 12);
    await page.waitForTimeout(500);
    const storage = await page.evaluate(() => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
    });
    expect(JSON.parse(storage['tresults.run']).prot).toBe('p2');
    await page.close();
    const nova = await context.newPage();
    await abrirApp(nova, storage);
    await nova.waitForSelector('#trSets .tr-set', { timeout: 10000 });
    await nova.evaluate(() => document.getElementById('trNext').click());
    await nova.waitForTimeout(400);
    const reg = await nova.evaluate(() => (__t.store.tdays[__t.todayKey()] || [])[0]);
    expect([reg.tid, reg.prot, reg.protNome]).toEqual(['w3', 'p2', 'Viagem']);
  });

  test('treino em andamento salvo pela versão anterior (sem prot) retoma no protocolo do treino', async ({ page }) => {
    await abrirApp(page, {
      ...doisProtocolos(),
      'tresults.run': JSON.stringify({
        w: { id: 'w3', nome: 'Treino A', prot: 'p2', protNome: 'Viagem', ex: [ex('Flexão de braço')] },
        start: Date.now() - 60000, idx: 0, logs: [], at: Date.now(),
      }),
    });
    await page.waitForSelector('#trSets .tr-set', { timeout: 10000 });
    expect(await page.evaluate(() => __t.trS.prot)).toBe('p2');
  });

  test('a referência da última carga não depende do protocolo', async ({ page }) => {
    await abrirApp(page, doisProtocolos({
      tdays: { [diaISO(2)]: [sessao('s2', 'Treino A', 800, { tid: 'w3', prot: 'p2' })] },
    }));
    expect(await page.evaluate(() => __t.lastExSession('Supino reto').sets[0].kg)).toBe(80);
  });

  test('com um protocolo só, o histórico não mostra nome de protocolo; com dois, mostra', async ({ page }) => {
    const s = { [diaISO(0)]: [sessao('s1', 'Treino A', 500, { tid: 'w1', prot: 'principal', protNome: 'Meu protocolo' })] };
    await abrirApp(page, estadoBase({ tdays: s }));
    expect(await page.textContent('#fdFeed .fd-card .h')).not.toMatch(/protocolo/i);
    await irTreino(page);
    expect(await page.textContent('#tTodayList')).not.toMatch(/Meu protocolo/);

    await abrirApp(page, doisProtocolos({ tdays: s }));
    expect(await page.textContent('#fdFeed .fd-card .h')).toMatch(/^Hipertrofia · /);
    await page.evaluate(() => document.querySelector('#fdFeed [data-fdver="s1"]').click());
    await page.waitForSelector('#sessaoOverlay.open');
    expect(await page.textContent('#ssSub')).toMatch(/Hipertrofia/);
  });

  test('recriar um protocolo excluído com o mesmo nome devolve o histórico dele', async ({ page }) => {
    await abrirApp(page, estadoBase({
      tdays: { [diaISO(2)]: [sessao('s1', 'Hotel', 500, { tid: 'velho', prot: 'p9', protNome: 'Viagem' })] },
    }));
    await irTreino(page);
    await criar(page, 'viagem');
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.id))).toEqual(['principal', 'p9']);
  });

  test('nuvem: aparelho com a versão anterior não apaga os protocolos; lista vazia de verdade vale', async ({ page }) => {
    await abrirApp(page, doisProtocolos());
    await page.evaluate(() => { const s = JSON.parse(JSON.stringify(__t.store)); delete s.tprotos; __t.applyRemote(s); });
    expect(await page.evaluate(() => __t.store.tprotos.map(p => p.nome))).toEqual(['Hipertrofia', 'Viagem']);
    await page.evaluate(() => { const s = JSON.parse(JSON.stringify(__t.store)); s.tprotos = []; s.tprotocol = []; __t.applyRemote(s); });
    expect(await page.evaluate(() => __t.store.tprotos)).toEqual([]);
  });

  test('nuvem: aparelho com a versão anterior que edita um treino não o tira do protocolo', async ({ page }) => {
    await abrirApp(page, doisProtocolos());
    await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(__t.store));
      const w = s.tprotocol.find(x => x.id === 'w3');
      delete w.prot; delete w.protNome; w.nome = 'Hotel';   // como o tpSave da versão anterior remonta
      __t.applyRemote(s);
    });
    const w = await page.evaluate(() => __t.store.tprotocol.find(x => x.id === 'w3'));
    expect([w.nome, w.prot, w.protNome]).toEqual(['Hotel', 'p2', 'Viagem']);
  });

  test('nuvem: aparelho novo reconstrói os protocolos pelos treinos, e não sobe a lista que não conhece', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await capturar(page);
    await page.evaluate(() => {
      __t.applyRemote({
        getd: 3000, days: {}, custom: [], goals: { nome: 'Pedro', tIntro: true }, liquids: {}, protocol: [], weights: [], tdays: {}, passos: {},
        tprotocol: [
          { id: 'w1', nome: 'Treino A', cat: 'A', ex: [{ n: 'Supino reto', s: 2, rest: 90, g: 'peito', sec: [] }] },
          { id: 'w3', nome: 'Hotel', cat: 'A', prot: 'p2', protNome: 'Viagem', ex: [{ n: 'Flexão de braço', s: 2, rest: 90, g: 'peito', sec: [] }] },
        ],
      });
    });
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome))).toEqual(['Meu protocolo', 'Viagem']);
    expect('tprotos' in (await gravado(page))).toBe(false);
    // a mesma entrada duas vezes não duplica nada
    await page.evaluate(() => __t.applyRemote(JSON.parse(JSON.stringify(__t.store))));
    expect(await page.evaluate(() => __t.listaProtocolos().length)).toBe(2);
  });

  test('protocolo excluído em outro aparelho com o pop-up aberto fecha com aviso', async ({ page }) => {
    await abrirApp(page, { ...doisProtocolos(), 'tresults.prot': 'p2' });
    await irTreino(page);
    await abrirProtocolo(page);
    await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(__t.store));
      s.tprotos = s.tprotos.filter(p => p.id !== 'p2'); s.tprotocol = s.tprotocol.filter(w => w.prot !== 'p2');
      __t.applyRemote(s);
    });
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/excluído em outro aparelho/);
    expect(await page.evaluate(() => document.getElementById('tprotoOverlay').classList.contains('open'))).toBe(false);
  });

  test('excluir os dados limpa protocolos e o protocolo aberto', async ({ page }) => {
    await abrirApp(page, { ...doisProtocolos(), 'tresults.prot': 'p2' });
    await page.evaluate(() => __t.setUser(null));
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
    await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('pfReset').click());
    await page.waitForSelector('#dangerOverlay.open');
    await page.evaluate(() => document.getElementById('dgConfirm').click());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => localStorage.getItem('tresults.prot'))).toBeNull();
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome))).toEqual(['Meu protocolo']);
  });

  test('em 320px, nome comprido de protocolo não empurra a tela', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const longo = 'Protocolo de hipertrofia para a fase de definição';
    await abrirApp(page, doisProtocolos({ tprotos: [{ id: 'principal', nome: longo }, { id: 'p2', nome: 'Viagem' }] }));
    await irTreino(page);
    const r = await page.evaluate(() => ({
      larg: document.documentElement.scrollWidth,
      botao: (() => { const b = document.getElementById('tOpenProtocol'); return b.scrollWidth <= b.clientWidth + 1; })(),
      cab: (() => { const c = document.querySelector('.prot-cab'); return c.scrollWidth <= c.clientWidth + 1; })(),
    }));
    expect(r.larg).toBeLessThanOrEqual(320);
    expect(r.botao).toBe(true);
    expect(r.cab).toBe(true);
  });
});
