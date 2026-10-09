/* Nada do que foi lançado sem sinal se perde.

   Antes, a abertura trocava o aparelho inteiro pelo documento da nuvem. Um
   treino finalizado no subsolo da academia, sem sinal, sumia calado se o
   Android descartasse a página antes de o sinal voltar: na abertura seguinte
   a nuvem (sem o treino) vinha por cima.

   Aqui a nuvem falsa tem estado (chave "__nuvem" no armazenamento local, veja
   tests/app.js), e recarregar a página é o app descartado e aberto de novo.
   "Outro aparelho" é o teste mexendo direto no documento da nuvem. */

const { test, expect } = require('@playwright/test');
const { isolarRede, coletarErros, urlApp, estadoBase, diaISO, iniciarTreino, preencherSerie } = require('./app');

const hoje = diaISO(0), ontem = diaISO(1), anteontem = diaISO(2);
const loja = () => JSON.parse(estadoBase()['cutting.v1']);
const avulso = (id, name = 'Caminhada') => ({ id, name, min: 40, kcal: 200 });
const comida = (id, name = 'Arroz') => ({ id, name, grams: 100, unit: 'g', base: null, kcal: 130, p: 2, c: 28, g: 0, status: 'consumido' });

/** Semeia o armazenamento UMA vez, antes de qualquer script do app: a partir
    daí, recarregar é reabrir o app com o que ficou no aparelho. */
async function abrir(page, { aparelho, nuvem, base, pendente, extra = {} }) {
  await isolarRede(page.context());
  const erros = coletarErros(page);
  const s = { 'cutting.v1': JSON.stringify(aparelho), 'cutting.owner': 'u1', '__nuvem': JSON.stringify(nuvem === undefined ? null : nuvem), ...extra };
  if (pendente) s['cutting.pendente'] = JSON.stringify(pendente === true ? { uid: 'u1' } : pendente);
  if (base) s['cutting.base'] = JSON.stringify({ uid: 'u1', doc: base });
  await page.addInitScript(s => {
    /* O sinal volta só na página NOVA: a velha, ao sair, tenta enviar e
       falha, como acontece com a página que o Android descarta sem sinal. */
    if (sessionStorage.getItem('__ligarRede')) { localStorage.removeItem('__semRede'); sessionStorage.removeItem('__ligarRede'); }
    if (sessionStorage.getItem('__semeado')) return;
    localStorage.clear();
    for (const k in s) localStorage.setItem(k, s[k]);
    sessionStorage.setItem('__semeado', '1');
  }, s);
  await page.goto(urlApp());
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  return erros;
}
const reabrir = async page => {
  await page.reload();
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(400);
};
/** Sem sinal, o Android descarta a página; depois o app abre com sinal. */
const reabrirComSinal = async page => {
  expect(await page.evaluate(() => localStorage.getItem('__semRede')), 'o cenário começa sem sinal').toBe('1');
  await page.evaluate(() => sessionStorage.setItem('__ligarRede', '1'));
  await reabrir(page);
  expect(await page.evaluate(() => localStorage.getItem('__semRede'))).toBeNull();
};
/** Espera a fila de envio esvaziar (o envio espera 800 ms depois do último toque). */
const assentar = async page => {
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => !__t.enviando, null, { timeout: 5000 });
  await page.waitForTimeout(50);
};
const nuvem = page => page.evaluate(() => JSON.parse(localStorage.getItem('__nuvem')));
const semRede = (page, sim) => page.evaluate(s => s ? localStorage.setItem('__semRede', '1') : localStorage.removeItem('__semRede'), sim);
const outroAparelho = (page, fn) => page.evaluate(`(() => {
  const d = JSON.parse(localStorage.getItem('__nuvem'));
  (${fn})(d);
  d.writer = 'outro';
  localStorage.setItem('__nuvem', JSON.stringify(d));
})()`);
const ids = l => (l || []).map(x => x.id);
const sincTexto = page => page.evaluate(() => document.getElementById('syncText').textContent);

test.describe('Sem sinal', () => {

  test('treino finalizado sem sinal sobrevive ao app descartado e aberto de novo', async ({ page }) => {
    const x = loja();
    const erros = await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    await iniciarTreino(page);
    await preencherSerie(page, 0, 60, 10);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(1200);
    const feito = await page.evaluate(h => (__t.store.tdays[h] || []).map(s => s.id), hoje);
    expect(feito.length, 'o treino foi gravado no aparelho').toBe(1);
    expect(await sincTexto(page)).toBe('Sem sinal, salvo no aparelho');
    expect((await nuvem(page)).tdays[hoje], 'sem sinal, a nuvem não recebeu nada').toBeUndefined();

    // o Android descarta a página; o sinal volta; a pessoa abre o app
    await reabrirComSinal(page);
    await assentar(page);
    expect(await page.evaluate(h => (__t.store.tdays[h] || []).map(s => s.id), hoje), 'o treino continua no aparelho').toEqual(feito);
    expect(ids((await nuvem(page)).tdays[hoje]), 'e chegou à nuvem').toEqual(feito);
    expect(await page.evaluate(() => localStorage.getItem('cutting.pendente')), 'com a nuvem em dia, a marca sai').toBeNull();
    expect(await sincTexto(page)).toBe('Sincronizado');
    expect(erros).toEqual([]);
  });

  test('o que foi lançado sem sinal e o que outro aparelho gravou ficam os dois', async ({ page }) => {
    const x = loja();
    x.days = { [ontem]: [comida('c0')] };
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    await page.evaluate(([h]) => {
      __t.store.days[h] = [{ id: 'c1', name: 'Frango', grams: 150, unit: 'g', base: null, kcal: 240, p: 45, c: 0, g: 5, status: 'consumido' }];
      __t.store.tdays[h] = [{ id: 's1', name: 'Caminhada', min: 40, kcal: 200 }];
      __t.salvar();
    }, [hoje]);
    await page.waitForTimeout(1000);
    // enquanto isso, no outro celular: um treino ontem e um item a mais ontem
    await outroAparelho(page, `d => {
      d.tdays['${ontem}'] = [{ id: 's9', name: 'Corrida', min: 30, kcal: 300 }];
      d.days['${ontem}'].push({ id: 'c9', name: 'Ovo', grams: 50, unit: 'g', base: null, kcal: 70, p: 6, c: 0, g: 5, status: 'consumido' });
    }`);
    await reabrirComSinal(page);
    await assentar(page);
    for (const fonte of ['aparelho', 'nuvem']) {
      const d = fonte === 'aparelho' ? await page.evaluate(() => JSON.parse(JSON.stringify(__t.store))) : await nuvem(page);
      expect(ids(d.days[hoje]), fonte).toEqual(['c1']);
      expect(ids(d.tdays[hoje]), fonte).toEqual(['s1']);
      expect(ids(d.tdays[ontem]), fonte).toEqual(['s9']);
      expect(ids(d.days[ontem]), fonte).toEqual(['c0', 'c9']);
    }
  });

  test('com sinal, o que outro aparelho gravou e ainda não chegou aqui não é apagado pela gravação daqui', async ({ page }) => {
    /* A gravação é uma transação: lê a nuvem na hora de gravar e junta. Antes
       ela gravava por cima, às cegas. */
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await outroAparelho(page, `d => { d.tdays['${ontem}'] = [{ id: 's9', name: 'Corrida', min: 30, kcal: 300 }]; }`);
    await page.evaluate(h => { __t.store.tdays[h] = [{ id: 's1', name: 'Caminhada', min: 40, kcal: 200 }]; __t.salvar(); }, hoje);
    await assentar(page);
    const d = await nuvem(page);
    expect(ids(d.tdays[ontem])).toEqual(['s9']);
    expect(ids(d.tdays[hoje])).toEqual(['s1']);
    expect(await page.evaluate(h => __t.store.tdays[h].map(s => s.id), ontem), 'e o daqui recebe o de lá').toEqual(['s9']);
  });

  test('apagado aqui sem sinal continua apagado; apagado lá continua apagado', async ({ page }) => {
    const x = loja();
    const tresDias = diaISO(3);
    x.weights = [{ d: anteontem, w: 81 }, { d: ontem, w: 80.5 }];
    x.tdays = { [anteontem]: [avulso('s1'), avulso('s2', 'Corrida')] };
    x.passos = { [anteontem]: { n: 8000, inclui: false }, [ontem]: { n: 6000, inclui: false } };
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    // aqui: apaga a pesagem e os passos de ontem, lança uma pesagem hoje
    await page.evaluate(([o, h]) => {
      __t.store.weights = __t.store.weights.filter(p => p.d !== o).concat([{ d: h, w: 80 }]);
      delete __t.store.passos[o];
      __t.salvar();
    }, [ontem, hoje]);
    await page.waitForTimeout(1000);
    // lá: apaga a corrida de anteontem, e também mexe nas pesagens e nos passos
    // (outra data), para a mescla ter de olhar registro por registro
    await outroAparelho(page, `d => {
      d.tdays['${anteontem}'] = d.tdays['${anteontem}'].filter(s => s.id !== 's2');
      d.weights.push({ d: '${tresDias}', w: 81.4 });
      d.passos['${tresDias}'] = { n: 9000, inclui: false };
    }`);
    await reabrirComSinal(page);
    await assentar(page);
    for (const d of [await page.evaluate(() => JSON.parse(JSON.stringify(__t.store))), await nuvem(page)]) {
      expect(d.weights.map(p => p.d).sort()).toEqual([tresDias, anteontem, hoje].sort());
      expect(ids(d.tdays[anteontem])).toEqual(['s1']);
      expect(Object.keys(d.passos).sort()).toEqual([tresDias, anteontem].sort());
    }
  });

  test('água lançada nos dois aparelhos soma, e o anel não desmente a lista', async ({ page }) => {
    const x = loja();
    x.liquids = { [hoje]: 500 };
    x.liqLog = { [hoje]: [{ id: 'l1', ml: 500, t: '08:00' }] };
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    await page.evaluate(h => { __t.store.liquids[h] = 800; __t.store.liqLog[h].push({ id: 'l2', ml: 300, t: '10:00' }); __t.salvar(); }, hoje);
    await page.waitForTimeout(1000);
    await outroAparelho(page, `d => { d.liquids['${hoje}'] = 700; d.liqLog['${hoje}'].push({ id: 'l3', ml: 200, t: '11:00' }); }`);
    await reabrirComSinal(page);
    await assentar(page);
    const d = await nuvem(page);
    expect(d.liquids[hoje]).toBe(1000);
    expect(ids(d.liqLog[hoje]).sort()).toEqual(['l1', 'l2', 'l3']);
    expect(await page.evaluate(h => __t.store.liquids[h], hoje)).toBe(1000);
  });

  test('duas vezes sem sinal seguidas: a água de cada vez conta uma vez só', async ({ page }) => {
    /* A base precisa andar junto com a nuvem: com a base velha, a segunda
       mescla somaria de novo o que a primeira já tinha enviado. */
    const x = loja();
    x.liquids = { [hoje]: 500 };
    x.liqLog = { [hoje]: [{ id: 'l1', ml: 500, t: '08:00' }] };
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    await page.evaluate(h => { __t.store.liquids[h] = 800; __t.store.liqLog[h].push({ id: 'l2', ml: 300, t: '10:00' }); __t.salvar(); }, hoje);
    await page.waitForTimeout(1000);
    await reabrirComSinal(page);
    await assentar(page);
    expect((await nuvem(page)).liquids[hoje]).toBe(800);

    await semRede(page, true);
    await page.evaluate(h => { __t.store.liquids[h] = 900; __t.store.liqLog[h].push({ id: 'l3', ml: 100, t: '12:00' }); __t.salvar(); }, hoje);
    await page.waitForTimeout(1000);
    await outroAparelho(page, `d => { d.liquids['${hoje}'] = 1000; d.liqLog['${hoje}'].push({ id: 'l4', ml: 200, t: '13:00' }); }`);
    await reabrirComSinal(page);
    await assentar(page);
    expect((await nuvem(page)).liquids[hoje]).toBe(1100);
    expect(await page.evaluate(h => __t.store.liquids[h], hoje)).toBe(1100);
  });

  test('a mesma coisa mexida nos dois sem sinal: vale a deste aparelho, e o resto do objetivo junta', async ({ page }) => {
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    await page.evaluate(() => { __t.store.goals.pesoAlvo = 74; __t.salvar(); });
    await page.waitForTimeout(1000);
    await outroAparelho(page, `d => { d.goals.pesoAlvo = 76; d.goals.meses = 4; }`);
    await reabrirComSinal(page);
    await assentar(page);
    const g = (await nuvem(page)).goals;
    expect(g.pesoAlvo).toBe(74);
    expect(g.meses, 'o que só o outro mexeu fica').toBe(4);
  });

  test('aparelho vindo da versão anterior (sem base): nada que só ele tem se perde, e no conflito vale a nuvem', async ({ page }) => {
    /* Sem a base não há como saber o que foi apagado de cada lado. Junta tudo,
       e no que os dois têm diferente vale a nuvem: este aparelho pode ser um
       celular parado há semanas. */
    const aqui = loja();
    aqui.tdays = { [hoje]: [avulso('s1')] };
    aqui.getd = 2900;
    const la = loja();
    la.tdays = { [ontem]: [avulso('s9', 'Corrida')] };
    la.getd = 3100;
    await abrir(page, { aparelho: aqui, nuvem: la, pendente: true });
    await assentar(page);
    const d = await nuvem(page);
    expect(ids(d.tdays[hoje])).toEqual(['s1']);
    expect(ids(d.tdays[ontem])).toEqual(['s9']);
    expect(d.getd).toBe(3100);
  });

  test('sem marca pendente, a abertura segue a nuvem, como sempre', async ({ page }) => {
    /* O aparelho em dia não tem o que defender: o que foi apagado em outro
       aparelho não pode voltar por este. */
    const aqui = loja();
    aqui.tdays = { [ontem]: [avulso('s1'), avulso('s2', 'Corrida')] };
    const la = loja();
    la.tdays = { [ontem]: [avulso('s1')] };
    await abrir(page, { aparelho: aqui, nuvem: la, base: aqui });
    await assentar(page);
    expect(await page.evaluate(o => __t.store.tdays[o].map(s => s.id), ontem)).toEqual(['s1']);
    expect(ids((await nuvem(page)).tdays[ontem])).toEqual(['s1']);
  });

  test('abrir e usar sem mexer em nada não deixa marca pendente nem grava', async ({ page }) => {
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="food"]').click());
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="inicio"]').click());
    await assentar(page);
    expect(await page.evaluate(() => localStorage.getItem('cutting.pendente'))).toBeNull();
  });

  test('gravação que falha mantém a marca e tenta de novo quando o sinal volta', async ({ page }) => {
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await semRede(page, true);
    await page.evaluate(h => { __t.store.tdays[h] = [{ id: 's1', name: 'Caminhada', min: 40, kcal: 200 }]; __t.salvar(); }, hoje);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cutting.pendente')))).toEqual({ uid: 'u1' });
    expect(await sincTexto(page)).toBe('Sem sinal, salvo no aparelho');
    await semRede(page, false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await assentar(page);
    expect(ids((await nuvem(page)).tdays[hoje])).toEqual(['s1']);
    expect(await page.evaluate(() => localStorage.getItem('cutting.pendente'))).toBeNull();
    expect(await sincTexto(page)).toBe('Sincronizado');
  });

  test('ao sair do app, o que está pendente é enviado na hora, sem esperar', async ({ page }) => {
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    const antes = await page.evaluate(() => +(localStorage.getItem('__gravacoes') || 0));
    await page.evaluate(h => {
      __t.store.tdays[h] = [{ id: 's1', name: 'Caminhada', min: 40, kcal: 200 }];
      __t.salvar();
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hoje);
    await page.waitForTimeout(150);   // bem menos que os 800 ms da espera normal
    expect(await page.evaluate(() => +(localStorage.getItem('__gravacoes') || 0))).toBe(antes + 1);
    expect(ids((await nuvem(page)).tdays[hoje])).toEqual(['s1']);
  });

  test('o que é lançado com o envio no meio do caminho não se perde', async ({ page }) => {
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await outroAparelho(page, `d => { d.tdays['${ontem}'] = [{ id: 's9', name: 'Corrida', min: 30, kcal: 300 }]; }`);
    await page.evaluate(() => localStorage.setItem('__lento', '600'));
    await page.evaluate(h => { __t.store.tdays[h] = [{ id: 's1', name: 'Caminhada', min: 40, kcal: 200 }]; __t.salvar(); }, hoje);
    await page.waitForFunction(() => __t.enviando, null, { timeout: 3000 });
    // a transação está lendo a nuvem: lança mais uma coisa agora
    await page.evaluate(h => { __t.store.weights.push({ d: h, w: 79.5 }); __t.salvar(); }, hoje);
    await page.waitForTimeout(2500);
    await assentar(page);
    for (const d of [await page.evaluate(() => JSON.parse(JSON.stringify(__t.store))), await nuvem(page)]) {
      expect(ids(d.tdays[hoje])).toEqual(['s1']);
      expect(ids(d.tdays[ontem])).toEqual(['s9']);
      expect(d.weights.map(p => p.d)).toEqual([hoje]);
    }
    expect(await page.evaluate(() => localStorage.getItem('cutting.pendente'))).toBeNull();
  });

  test('aviso atrasado da nuvem não apaga da tela o que acabou de subir', async ({ page }) => {
    /* O aviso de mudança pode chegar depois da gravação deste aparelho,
       trazendo o documento de antes. Aplicado direto, ele tiraria o treino
       que acabou de subir. */
    const x = loja();
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    const velho = await nuvem(page);
    velho.writer = 'outro';
    velho.goals.meses = 5;   // e o outro aparelho tinha mudado uma coisa
    await page.evaluate(h => { __t.store.tdays[h] = [{ id: 's1', name: 'Caminhada', min: 40, kcal: 200 }]; __t.salvar(); }, hoje);
    await assentar(page);
    await outroAparelho(page, `d => { d.goals.meses = 5; }`);
    await page.evaluate(v => window.__aviso({ exists: () => true, data: () => v }), velho);
    await assentar(page);
    expect(await page.evaluate(h => (__t.store.tdays[h] || []).map(s => s.id), hoje)).toEqual(['s1']);
    expect(await page.evaluate(() => __t.store.goals.meses)).toBe(5);
  });

  test('excluir dados substitui a nuvem: o que outro aparelho gravou antes não sobrevive', async ({ page }) => {
    const x = loja();
    x.tdays = { [ontem]: [avulso('s1')] };
    await abrir(page, { aparelho: x, nuvem: x, base: x });
    await outroAparelho(page, `d => { d.tdays['${anteontem}'] = [{ id: 's9', name: 'Corrida', min: 30, kcal: 300 }]; }`);
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
    await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('pfReset').click());
    await page.waitForTimeout(250);
    await page.evaluate(() => { const c = document.getElementById('dgPw'); c.value = 'qualquer'; document.getElementById('dgConfirm').click(); });
    await assentar(page);
    const d = await nuvem(page);
    expect(d.tdays, 'nada do histórico fica, nem o que o outro aparelho gravou').toEqual({});
    expect(await page.evaluate(() => localStorage.getItem('cutting.pendente'))).toBeNull();
  });

  test('outra conta entrando não leva o pendente da anterior', async ({ page }) => {
    const aqui = loja();
    aqui.tdays = { [hoje]: [avulso('s1')] };
    const la = loja();
    la.goals.nome = 'Bia';
    await abrir(page, { aparelho: aqui, nuvem: la, base: aqui, pendente: { uid: 'u0' }, extra: { 'cutting.owner': 'u0' } });
    await assentar(page);
    expect(await page.evaluate(() => __t.store.goals.nome)).toBe('Bia');
    expect((await nuvem(page)).tdays[hoje], 'o treino da conta anterior não vai para a nuvem desta').toBeUndefined();
    expect(await page.evaluate(() => localStorage.getItem('cutting.pendente'))).toBeNull();
  });
});

test.describe('A mescla', () => {
  /* Direto na função, com casos que a tela não alcança fácil. */
  const abrirSimples = async page => {
    await isolarRede(page.context());
    await page.goto(urlApp());
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  };

  test('campo ausente na nuvem não é vazio', async ({ page }) => {
    await abrirSimples(page);
    const M = await page.evaluate(() => __t.mesclar(
      { days: {}, academias: [{ id: 'a1', nome: 'Smart' }] },
      { days: {}, academias: [{ id: 'a1', nome: 'Smart' }] },
      { days: {} }));
    expect(M.academias).toEqual([{ id: 'a1', nome: 'Smart' }]);
  });

  test('registro mexido de um lado e apagado do outro: fica o mexido', async ({ page }) => {
    await abrirSimples(page);
    const M = await page.evaluate(() => __t.mesclar(
      { tprotocol: [{ id: 'w1', nome: 'A' }, { id: 'w2', nome: 'B' }] },
      { tprotocol: [{ id: 'w1', nome: 'A' }] },
      { tprotocol: [{ id: 'w1', nome: 'A' }, { id: 'w2', nome: 'B2' }] }));
    expect(M.tprotocol.map(w => w.nome)).toEqual(['A', 'B2']);
  });

  test('a ordem que só este aparelho mudou é mantida', async ({ page }) => {
    await abrirSimples(page);
    const M = await page.evaluate(() => __t.mesclar(
      { tprotocol: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] },
      { tprotocol: [{ id: 'w3' }, { id: 'w1' }, { id: 'w2' }] },
      { tprotocol: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }] }));
    expect(M.tprotocol.map(w => w.id)).toEqual(['w3', 'w1', 'w2', 'w4']);
  });

  test('o que foi lançado no meio da lista aqui fica no lugar; a ordem que só a nuvem mudou vale', async ({ page }) => {
    await abrirSimples(page);
    const r = await page.evaluate(() => [
      __t.mesclar(
        { tprotocol: [{ id: 'w1' }, { id: 'w2' }] },
        { tprotocol: [{ id: 'w1' }, { id: 'wN' }, { id: 'w2' }] },
        { tprotocol: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] }).tprotocol.map(w => w.id),
      __t.mesclar(
        { tprotocol: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }] },
        { tprotocol: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }] },
        { tprotocol: [{ id: 'w3' }, { id: 'w1' }, { id: 'w2' }] }).tprotocol.map(w => w.id),
    ]);
    expect(r[0]).toEqual(['w1', 'wN', 'w2', 'w3']);
    expect(r[1]).toEqual(['w3', 'w1', 'w2', 'w4']);
  });

  test('dois itens iguais sem id no mesmo dia continuam dois', async ({ page }) => {
    await abrirSimples(page);
    const item = { name: 'Banana', kcal: 90 };
    const M = await page.evaluate(i => __t.mesclar(
      { days: { d: [i, i] } }, { days: { d: [i, i, i] } }, { days: { d: [i, i] } }), item);
    expect(M.days.d.length).toBe(3);
  });

  test('campo de uma versão mais nova: vale o da nuvem; apagado lá, sai', async ({ page }) => {
    await abrirSimples(page);
    const M = await page.evaluate(() => __t.mesclar(
      { novo: 1, velho: 1 }, { novo: 1, velho: 1 }, { novo: 2 }));
    expect(M).toEqual({ novo: 2 });
  });
});
