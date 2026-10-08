/* Inventário de aparelhos por academia.

   Cada academia guarda o que ela NÃO tem. O app deduz o aparelho do nome do
   exercício e avisa — no cartão, no treino, na troca e no editor. Os riscos:
   aviso falso (que ensina a ignorar o aviso), academia sem inventário
   passando a avisar, e o "Tem, sim" no meio do descanso matando o descanso. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, preencherSerie } = require('./app');

const ex = (n, g = 'quadriceps') => ({ n, s: 2, rest: 90, g, sec: [] });
const PERNAS = { id: 'w1', nome: 'Pernas', cat: 'A', ex: [ex('Leg press'), ex('Cadeira extensora'), ex('Agachamento')] };
const estado = ({ faltam, sel = 'a1', tprotocol = [PERNAS], extra = {} } = {}) => ({
  ...estadoBase({
    academias: [{ id: 'a1', nome: 'Prédio', ...(faltam !== undefined ? { faltam } : {}) }, { id: 'a2', nome: 'Smart Fit' }],
    tprotocol, ...extra,
  }),
  ...(sel ? { 'tresults.acad': sel } : {}),
});
const irTreino = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForTimeout(250);
};
const iniciar = async (page, wid = 'w1') => {
  await page.evaluate(wid => document.querySelector(`#tprotoCards [data-tw="${wid}"]`).click(), wid);
  await page.waitForSelector('#trSets .tr-set');
};
const aviso = page => page.evaluate(() => {
  const el = document.getElementById('trFalta');
  return el.classList.contains('on') ? el.querySelector('.tf-t').textContent : '';
});
const abrirAparelhos = async (page, id = 'a1') => {
  await page.evaluate(() => document.getElementById('acadEditar').click());
  await page.waitForSelector('#acadOverlay.open');
  await page.evaluate(id => document.querySelector(`[data-acadequip="${id}"]`).click(), id);
  await page.waitForSelector('#equipOverlay.open');
};
const faltam = (page, id = 'a1') => page.evaluate(id => __t.store.academias.find(a => a.id === id).faltam, id);

test.describe('Inventário', () => {

  test('catálogo: todo exercício conhecido do app é reconhecido, e todo aparelho é usado', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => {
      const nomes = new Set();
      Object.values(__t.EX_POR_GRUPO_).forEach(l => l.forEach(n => nomes.add(n)));
      __t.T_SUG.forEach(p => p.w.forEach(w => w.ex.forEach(e => nomes.add(e.n))));
      const semRegra = [...nomes].filter(n => __t.exEquip(n) === null);
      const ids = new Set(__t.EQUIP.map(e => e.id));
      const usados = new Set();
      const inexistentes = [];
      __t.EX_EQUIP.forEach(([, req]) => (req || []).forEach(alt => alt.forEach(id => { usados.add(id); if (!ids.has(id)) inexistentes.push(id); })));
      return { total: nomes.size, semRegra, inexistentes, naoUsados: [...ids].filter(id => !usados.has(id)) };
    });
    expect(r.total).toBeGreaterThan(60);
    expect(r.semRegra).toEqual([]);
    expect(r.inexistentes).toEqual([]);
    expect(r.naoUsados).toEqual([]);
  });

  test('catálogo: o específico vem antes do genérico', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const casos = await page.evaluate(() => ({
      supinoHalter: __t.exEquip('Supino inclinado com halter'),
      supino: __t.exEquip('Supino reto'),
      agSmith: __t.exEquip('Agachamento smith'),
      pantLeg: __t.exEquip('Panturrilha no leg press'),
      flexao: __t.exEquip('Flexão de braço'),
      remadaUni: __t.exEquip('Remada unilateral'),
      flexoraPe: __t.exEquip('Flexora em pé'),
      desconhecido: __t.exEquip('Exercício que inventei'),
      maquinaSemRegra: __t.exEquip('Elevação lateral máquina'),
    }));
    expect(casos.supinoHalter.flat()).not.toContain('barra');
    expect(casos.supino.every(alt => alt.includes('barra'))).toBe(true);
    expect(casos.agSmith).toEqual([['smith']]);
    expect(casos.pantLeg).toEqual([['leg_press']]);
    expect(casos.flexao).toEqual([[]]);
    expect(casos.remadaUni).toEqual([['halteres']]);
    expect(casos.flexoraPe).toEqual([['flexora_pe']]);
    expect(casos.desconhecido).toBeNull();
    expect(casos.maquinaSemRegra, 'máquina que o catálogo não conhece não herda a regra geral').toBeNull();
  });

  test('academia sem inventário não gera aviso nenhum, e a troca fica na ordem de sempre', async ({ page }) => {
    const erros = await abrirApp(page, estado());
    await irTreino(page);
    expect(await page.evaluate(() => document.querySelectorAll('#tprotoCards .pcfalta').length)).toBe(0);
    await iniciar(page);
    expect(await aviso(page)).toBe('');
    await page.evaluate(() => document.getElementById('trTrocar').click());
    await page.waitForSelector('#trocaOverlay.open');
    const lista = await page.evaluate(() => [...document.querySelectorAll('#trocaLista [data-sub]')].map(b => b.dataset.sub));
    const grupo = await page.evaluate(() => __t.EX_POR_GRUPO_.quadriceps.filter(n => n !== 'Leg press'));
    expect(lista).toEqual(['Leg press', ...grupo]);
    expect(await page.evaluate(() => document.querySelectorAll('#trocaLista .falta').length)).toBe(0);
    expect(erros).toEqual([]);
  });

  test('abrir e fechar o pop-up sem tocar continua "não informado"', async ({ page }) => {
    await abrirApp(page, estado());
    await irTreino(page);
    await abrirAparelhos(page);
    expect(await page.textContent('#equipConta')).toMatch(/Ainda não informado/);
    expect(await page.evaluate(() => document.querySelectorAll('#equipGrupos [data-equip]:not(.on)').length), 'abre todo marcado').toBe(0);
    await page.evaluate(() => document.getElementById('equipFechar').click());
    await page.waitForTimeout(150);
    expect(await faltam(page)).toBeUndefined();
    expect(await page.textContent('[data-acadequip="a1"]')).toMatch(/Aparelhos não informados/);
  });

  test('desmarcar grava na hora, e a linha da academia mostra o estado', async ({ page }) => {
    await abrirApp(page, estado());
    await irTreino(page);
    await abrirAparelhos(page);
    await page.evaluate(() => document.querySelector('#equipGrupos [data-equip="leg_press"]').click());
    expect(await faltam(page)).toEqual(['leg_press']);
    await page.evaluate(() => document.querySelector('#equipGrupos [data-equip="smith"]').click());
    expect(await faltam(page), 'na ordem do catálogo').toEqual(['smith', 'leg_press']);
    expect(await page.textContent('#equipConta')).toMatch(/^Faltam 2 de \d+\.$/);
    await page.evaluate(() => document.querySelector('#equipGrupos [data-equip="smith"]').click());
    expect(await faltam(page)).toEqual(['leg_press']);
    await page.evaluate(() => document.getElementById('equipFechar').click());
    await page.waitForTimeout(150);
    expect(await page.textContent('[data-acadequip="a1"]')).toMatch(/Não tem: Leg press/);
  });

  test('"Tem de tudo" e "Desmarcar tudo" (com confirmação; "Voltar" não muda)', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['hack'] }));
    await irTreino(page);
    await abrirAparelhos(page);
    await page.evaluate(() => document.getElementById('equipNada').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgCancel').click());
    await page.waitForTimeout(150);
    expect(await faltam(page)).toEqual(['hack']);
    await page.evaluate(() => document.getElementById('equipNada').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(150);
    expect((await faltam(page)).length).toBe(await page.evaluate(() => __t.EQUIP.length));
    await page.evaluate(() => document.getElementById('equipTudo').click());
    expect(await faltam(page)).toEqual([]);
    expect(await page.textContent('#equipConta')).toMatch(/Tem todos os/);
  });

  test('o cartão avisa os exercícios sem aparelho na academia escolhida; com "Todas", não', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['leg_press', 'extensora'] }));
    await irTreino(page);
    expect(await page.textContent('#tprotoCards .pcfalta')).toBe('Sem aparelho aqui para: Leg press, Cadeira extensora');
    await page.evaluate(() => document.querySelector('#acadBar [data-acad=""]').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.querySelectorAll('#tprotoCards .pcfalta').length)).toBe(0);
  });

  test('no treino, o aviso aparece; "Trocar" abre a lista com o que dá para fazer primeiro e já escolhido', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['leg_press', 'hack', 'smith'] }));
    await irTreino(page);
    await iniciar(page);
    expect(await aviso(page)).toBe('Pelo seu cadastro, a Prédio não tem Leg press.');
    await page.evaluate(() => document.getElementById('trFaltaTrocar').click());
    await page.waitForSelector('#trocaOverlay.open');
    const r = await page.evaluate(() => ({
      nome: document.getElementById('trocaNome').value,
      ops: [...document.querySelectorAll('#trocaLista [data-sub]')].map(b => ({ n: b.dataset.sub, falta: b.classList.contains('falta'), atual: b.classList.contains('atual') })),
    }));
    expect(r.ops[0]).toEqual({ n: 'Leg press', falta: true, atual: false });
    expect(r.nome).toBe('Agachamento');
    expect(r.ops.find(o => o.atual).n).toBe('Agachamento');
    // o que falta vai para o fim, marcado e ainda tocável
    const faltando = r.ops.slice(1).filter(o => o.falta).map(o => o.n);
    expect(faltando).toEqual(['Hack machine', 'Agachamento smith']);
    expect(r.ops.slice(-2).map(o => o.n)).toEqual(faltando);
    await page.evaluate(() => document.querySelector('#trocaLista [data-sub="Hack machine"]').click());
    expect(await page.inputValue('#trocaNome')).toBe('Hack machine');
  });

  test('"Tem, sim" corrige o cadastro, o aviso some e o descanso continua correndo', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['leg_press', 'smith'] }));
    await irTreino(page);
    await iniciar(page);
    await preencherSerie(page, 0, 100, 10, 1);
    await page.evaluate(() => document.getElementById('trRest').click());   // começa o descanso
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __t.trRestEnd)).toBeGreaterThan(0);
    await page.evaluate(() => document.getElementById('trFaltaTem').click());
    await page.waitForTimeout(150);
    expect(await faltam(page)).toEqual(['smith']);
    expect(await aviso(page)).toBe('');
    expect(await page.evaluate(() => __t.trRestEnd), 'o descanso não pode ser interrompido').toBeGreaterThan(0);
    expect(await page.evaluate(() => document.querySelector('#trSets .ikg').value), 'o digitado fica').toBe('100');
  });

  test('exercício trocado não avisa; "Desfazer" traz o aviso de volta', async ({ page }) => {
    /* A troca é para um que TAMBÉM falta: a pessoa escolheu de propósito, numa
       lista que já o mostrava como "sem aparelho aqui". */
    await abrirApp(page, estado({ faltam: ['leg_press', 'hack'] }));
    await irTreino(page);
    await iniciar(page);
    await page.evaluate(() => document.getElementById('trFaltaTrocar').click());
    await page.evaluate(() => document.querySelector('#trocaLista [data-sub="Hack machine"]').click());
    await page.evaluate(() => document.getElementById('trocaOk').click());
    await page.waitForTimeout(150);
    expect(await aviso(page)).toBe('');
    await page.evaluate(() => document.getElementById('trDesfazer').click());
    await page.waitForTimeout(150);
    expect(await aviso(page)).toMatch(/não tem Leg press/);
  });

  test('sem inventário, a troca oferece marcar os aparelhos e volta sem perder o que foi digitado', async ({ page }) => {
    await abrirApp(page, estado());
    await irTreino(page);
    await iniciar(page);
    await page.evaluate(() => document.getElementById('trTrocar').click());
    await page.waitForSelector('#trocaOverlay.open');
    await page.fill('#trocaNome', 'Meu exercício');
    expect(await page.textContent('#trocaInv')).toMatch(/Marque os aparelhos da Prédio/);
    await page.evaluate(() => document.getElementById('trocaInvBtn').click());
    await page.waitForSelector('#equipOverlay.open');
    await page.evaluate(() => document.querySelector('#equipGrupos [data-equip="hack"]').click());
    await page.evaluate(() => document.getElementById('equipFechar').click());
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      aberta: document.getElementById('trocaOverlay').classList.contains('open'),
      nome: document.getElementById('trocaNome').value,
      hack: document.querySelector('#trocaLista [data-sub="Hack machine"]').classList.contains('falta'),
      rodape: getComputedStyle(document.getElementById('trocaInv')).display,
    }));
    expect(r).toEqual({ aberta: true, nome: 'Meu exercício', hack: true, rodape: 'none' });
  });

  test('o editor avisa pela academia marcada; sem nenhuma marcada, pelas que têm inventário', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['leg_press'], sel: '' }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('tOpenProtocol').click());
    await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w1"]').click());
    await page.waitForSelector('#tpEditOverlay.open');
    expect(await page.textContent('#tpEquipNota')).toBe('Na Prédio falta aparelho para Leg press. Dá para salvar assim e trocar na hora do treino.');
    await page.evaluate(() => document.querySelector('#tpAcads [data-tpacad="a2"]').click());
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('tpEquipNota')).display), 'só a Smart Fit, que não informou nada').toBe('none');
  });

  test('alternativas: "Agachamento" e "Remada curvada" não avisam se uma das formas existe', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['halteres', 'smith'] }));
    const r = await page.evaluate(() => ({
      remada: __t.equipFalta('Remada curvada', 'a1'),   // barra serve
      agach: __t.equipFalta('Agachamento', 'a1'),       // barra e gaiola; o Smith não é o agachamento livre
      martelo: __t.equipFalta('Rosca martelo', 'a1'),   // só com halter
    }));
    expect(r.remada).toBeNull();
    expect(r.agach).toBeNull();
    expect(r.martelo.ids).toEqual(['halteres']);
  });

  test('exercício que o app não reconhece, e peso do corpo, nunca recebem aviso', async ({ page }) => {
    const todos = await (async () => { await abrirApp(page, estadoBase()); return page.evaluate(() => __t.EQUIP.map(e => e.id)); })();
    await abrirApp(page, estado({ faltam: todos }));
    const r = await page.evaluate(() => [
      __t.equipFalta('Exercício que inventei', 'a1'),
      __t.equipFalta('Flexão de braço', 'a1'),
      __t.equipFalta('Prancha', 'a1'),
      __t.equipFalta('Afundo', 'a1'),
    ]);
    expect(r).toEqual([null, null, null, null]);
  });

  test('sessão sem academia não usa inventário; o aviso segue a academia da sessão restaurada', async ({ page, context }) => {
    await abrirApp(page, estado({ faltam: ['leg_press'], sel: '' }));
    await irTreino(page);
    await iniciar(page);
    expect(await aviso(page), 'com "Todas" e treino de todas as academias, não se sabe onde é').toBe('');
    await page.evaluate(() => document.getElementById('trQuit').click());
    await page.waitForSelector('#appDlgOverlay.open');
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(150);

    await page.evaluate(() => localStorage.setItem('tresults.acad', 'a1'));
    await page.evaluate(() => document.querySelector('#acadBar [data-acad="a1"]').click());
    await iniciar(page);
    await page.waitForTimeout(500);
    const storage = await page.evaluate(() => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o;
    });
    storage['tresults.acad'] = 'a2';   // trocou a escolha; o treino continua onde começou
    await page.close();
    const nova = await context.newPage();
    await abrirApp(nova, storage);
    await nova.waitForSelector('#trSets .tr-set', { timeout: 10000 });
    expect(await aviso(nova)).toMatch(/Prédio não tem Leg press/);
  });

  test('aparelho que esta versão não conhece fica guardado e não entra na conta', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['aparelho_do_futuro'] }));
    await irTreino(page);
    expect(await page.evaluate(() => document.querySelectorAll('#tprotoCards .pcfalta').length)).toBe(0);
    await abrirAparelhos(page);
    expect(await page.textContent('#equipConta')).toMatch(/Tem todos os/);
    await page.evaluate(() => document.querySelector('#equipGrupos [data-equip="hack"]').click());
    expect(await faltam(page)).toEqual(['hack', 'aparelho_do_futuro']);
  });

  test('o inventário sobrevive a renomear a academia e a uma resposta da nuvem, e sobe junto', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['hack'] }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.evaluate(() => document.querySelector('[data-acadren="a1"]').click());
    await page.fill('#acadRenIn', 'Academia do prédio');
    await page.evaluate(() => document.querySelector('[data-acadok]').click());
    await page.waitForTimeout(100);
    expect(await faltam(page)).toEqual(['hack']);
    await page.evaluate(() => __t.applyRemote(JSON.parse(JSON.stringify(__t.store))));
    expect(await faltam(page)).toEqual(['hack']);
    await page.evaluate(() => {
      window.__pushes = [];
      window.__fb.setDoc = (r, d) => { window.__pushes.push(JSON.parse(JSON.stringify(d))); return Promise.resolve(); };
    });
    await page.evaluate(() => window.__t.pushRemote());
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => window.__pushes.at(-1).academias[0].faltam)).toEqual(['hack']);
  });

  test('excluir a academia avisa que a lista de aparelhos sai junto; recadastrar começa "não informado"', async ({ page }) => {
    await abrirApp(page, estado({ faltam: ['hack'], extra: { tdays: {} } }));
    await irTreino(page);
    await page.evaluate(() => document.getElementById('acadEditar').click());
    await page.evaluate(() => document.querySelector('[data-acaddel="a1"]').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/A lista de aparelhos dela sai junto/);
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    await page.waitForTimeout(150);
    await page.fill('#acadNome', 'Prédio');
    await page.evaluate(() => document.getElementById('acadAdd').click());
    await page.waitForTimeout(150);
    const a = await page.evaluate(() => __t.store.academias.find(x => x.nome === 'Prédio'));
    expect(a.faltam).toBeUndefined();
  });

  test('academia excluída em outro aparelho com o pop-up aberto: tocar não a recria', async ({ page }) => {
    await abrirApp(page, estado({ faltam: [] }));
    await irTreino(page);
    await abrirAparelhos(page);
    await page.evaluate(() => {
      const s = JSON.parse(JSON.stringify(__t.store));
      s.academias = s.academias.filter(a => a.id !== 'a1');
      __t.applyRemote(s);
    });
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/excluída em outro aparelho/);
    expect(await page.evaluate(() => document.getElementById('equipOverlay').classList.contains('open'))).toBe(false);
    expect(await page.evaluate(() => __t.store.academias.map(a => a.id))).toEqual(['a2']);
  });

  test('em 320px, a linha da academia, o pop-up, o cartão e o aviso do treino não rolam para o lado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const todos = await (async () => { await abrirApp(page, estadoBase()); return page.evaluate(() => __t.EQUIP.map(e => e.id)); })();
    await abrirApp(page, estado({ faltam: todos.slice(0, 8) }));
    await irTreino(page);
    const largura = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await largura()).toBeLessThanOrEqual(320);
    await abrirAparelhos(page);
    expect(await page.evaluate(() => { const m = document.querySelector('#equipOverlay .modal'); return m.scrollWidth <= m.clientWidth + 1; })).toBe(true);
    await page.evaluate(() => document.getElementById('equipFechar').click());
    await page.evaluate(() => document.getElementById('acadFechar').click());
    await page.waitForTimeout(150);
    await iniciar(page);
    expect(await page.evaluate(() => { const m = document.getElementById('trFalta'); return m.scrollWidth <= m.clientWidth + 1; })).toBe(true);
    expect(await largura()).toBeLessThanOrEqual(320);
  });
});
