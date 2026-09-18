/* Histórico de ingestão de líquidos.

   O pedido do dono: "para a pessoa que não lembra o horário que bebeu e se
   adicionou". O total sozinho não responde a isso — 1800 ml na tela não diz se
   a garrafa do almoço já foi lançada ou se ela está prestes a ser lançada duas
   vezes.

   Dois cuidados que estes testes fixam:

   `store.liquids[dia]` continua sendo o total que manda, porque é ele que já
   existe no aparelho de quem usa o app. O `liqLog` é anotação de **quando**, e
   pode estar incompleto em dados antigos — nesse caso a diferença aparece como
   uma linha própria, em vez de a lista e o total se desmentirem na tela.

   E horário não se inventa: lançar água num dia passado não ganha a hora de
   agora. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, diaISO } = require('./app');

const irAlimentacao = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="food"]').click());
  await page.waitForTimeout(300);
};

const addAgua = async (page, ml) => {
  await page.evaluate(v => document.querySelector(`[data-add="${v}"]`).click(), ml);
  await page.waitForTimeout(200);
};

/** Cada linha do histórico: horário, nome, quantidade e se dá para excluir. */
const historico = page => page.evaluate(() =>
  [...document.querySelectorAll('#liqHist .lh-row')].map(r => ({
    h: r.querySelector('.lh-h').textContent.trim(),
    nome: r.querySelector('.lh-n').childNodes[0].textContent.trim(),
    de: r.querySelector('.lh-n small') ? r.querySelector('.lh-n small').textContent.trim() : null,
    ml: r.querySelector('.lh-ml').textContent.trim(),
    apagavel: !!r.querySelector('[data-liqdel]'),
  })));

const totalNaTela = page => page.evaluate(() => {
  const m = document.getElementById('liqSum').textContent.match(/(\d+)\s*ml/);
  return m ? parseInt(m[1], 10) : null;
});

test.describe('Histórico de líquidos', () => {

  test('cada adição vira uma linha com horário', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);

    const h = await historico(page);
    expect(h.length).toBe(1);
    expect(h[0].ml).toBe('250 ml');
    expect(h[0].nome).toBe('Água');
    expect(h[0].h, 'lançamento de hoje tem hora de verdade').toMatch(/^\d{2}:\d{2}$/);
  });

  test('a mais recente aparece primeiro', async ({ page }) => {
    /* Quem abre o app para conferir quer ver o último lançamento, não o
       primeiro da manhã. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);
    await page.waitForTimeout(1100);          // para os horários não empatarem
    await addAgua(page, 500);

    const h = await historico(page);
    expect(h.map(x => x.ml)).toEqual(['500 ml', '250 ml']);
  });

  test('sem nada lançado, a lista diz isso em vez de ficar vazia', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    expect(await page.evaluate(() => document.getElementById('liqHist').textContent))
      .toMatch(/Nada registrado neste dia/);
  });

  test('excluir uma linha desconta do total', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);
    await addAgua(page, 500);
    expect(await totalNaTela(page)).toBe(750);

    await page.evaluate(() => document.querySelector('#liqHist [data-liqdel]').click());
    await page.waitForTimeout(250);

    expect(await totalNaTela(page), 'o anel precisa acompanhar a lista').toBe(250);
    const h = await historico(page);
    expect(h.length).toBe(1);
    expect(h[0].ml).toBe('250 ml');
  });

  test('bebida lançada como refeição entra na lista, mas não é apagável daqui', async ({ page }) => {
    /* Apagar ali mexeria nas calorias do dia. Quem tira comida é a lista de
       comida, não a de água. */
    const dias = {};
    dias[diaISO(0)] = [{
      id: 'suco1', name: 'Suco de laranja', grams: 300, unit: 'ml', base: null,
      kcal: 135, p: 2, c: 31, g: 0.3, status: 'consumido', meal: 'almoco', t: Date.now(),
    }];
    await abrirApp(page, estadoBase({ days: dias }));
    await irAlimentacao(page);

    const h = await historico(page);
    const suco = h.find(x => /Suco/.test(x.nome));
    expect(suco, 'bebida em ml é líquido para quem bebeu').toBeTruthy();
    expect(suco.ml).toBe('300 ml');
    expect(suco.de).toBe('Almoço');
    expect(suco.apagavel).toBe(false);
  });

  test('total antigo sem histórico aparece como linha própria', async ({ page }) => {
    /* Quem já usa o app tem `liquids` gravado e nenhum `liqLog`. Mostrar só a
       lista faria a soma das linhas não bater com o anel. */
    const liquids = {}; liquids[diaISO(0)] = 1200;
    await abrirApp(page, estadoBase({ liquids }));
    await irAlimentacao(page);

    const h = await historico(page);
    expect(h.length).toBe(1);
    expect(h[0].nome).toMatch(/antes de existir histórico/i);
    expect(h[0].ml).toBe('1200 ml');
    expect(await totalNaTela(page)).toBe(1200);
  });

  test('a soma das linhas bate com o total, misturando origens', async ({ page }) => {
    const liquids = {}; liquids[diaISO(0)] = 400;          // lançado por versão antiga
    const dias = {};
    dias[diaISO(0)] = [{ id: 'c1', name: 'Café', grams: 200, unit: 'ml', base: null,
      kcal: 4, p: 0, c: 1, g: 0, status: 'consumido', meal: 'cafe', t: Date.now() }];
    await abrirApp(page, estadoBase({ liquids, days: dias }));
    await irAlimentacao(page);
    await addAgua(page, 500);

    const h = await historico(page);
    const soma = h.reduce((a, x) => a + parseInt(x.ml, 10), 0);
    expect(soma).toBe(await totalNaTela(page));
    expect(soma).toBe(1100);
  });

  test('num dia passado o horário não é inventado', async ({ page }) => {
    /* Lançar ontem com a hora de agora seria escrever uma mentira no
       histórico. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await page.evaluate(() => document.getElementById('dayPrev').click());
    await page.waitForTimeout(350);
    await addAgua(page, 250);

    const h = await historico(page);
    expect(h.length).toBe(1);
    expect(h[0].h).toBe('--:--');
    expect(await page.evaluate(() => {
      const d = Object.values(__t.store.liqLog).flat();
      return d.some(x => x.t !== undefined);
    }), 'nada de carimbo de hora num dia passado').toBe(false);
  });

  test('o histórico é do dia que está sendo visto', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);
    expect((await historico(page)).length).toBe(1);

    await page.evaluate(() => document.getElementById('dayPrev').click());
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => document.getElementById('liqHist').textContent))
      .toMatch(/Nada registrado neste dia/);

    await page.evaluate(() => document.getElementById('dayNext').click());
    await page.waitForTimeout(350);
    expect((await historico(page)).length).toBe(1);
  });
});

test.describe('Três de cada vez, o resto no dedo', () => {
  /* Pedido do dono: mostrar de primeira só os três lançamentos mais recentes,
     e o resto por rolagem, sem barra — a pessoa rola com o próprio dedo.

     Duas coisas que os testes fixam: a altura sai da posição da quarta linha e
     não de um número chutado (linha com origem é mais alta que linha de água, e
     altura fixa cortaria a terceira ao meio em parte dos dias); e o esmaecido
     existe porque, sem barra de rolagem, uma lista cortada parece inteira. */

  const seis = () => {
    const liqLog = {}, t = Date.now();
    liqLog[diaISO(0)] = [
      { id: 'a1', ml: 500, t: t - 6 * 3600e3 },
      { id: 'a2', ml: 250, t: t - 5 * 3600e3 },
      { id: 'a3', ml: 500, t: t - 4 * 3600e3 },
      { id: 'a4', ml: 250, t: t - 3 * 3600e3 },
      { id: 'a5', ml: 500, t: t - 2 * 3600e3 },
      { id: 'a6', ml: 250, t: t - 1 * 3600e3 },
    ];
    const liquids = {}; liquids[diaISO(0)] = 2250;
    return estadoBase({ liqLog, liquids });
  };

  const caixa = page => page.evaluate(() => {
    const cx = document.querySelector('#liqHist .lh-cx');
    const lista = cx.querySelector('.lh-lista');
    const linhas = [...lista.querySelectorAll('.lh-row')];
    const r = lista.getBoundingClientRect();
    return {
      linhas: linhas.length,
      rolavel: lista.scrollHeight > lista.clientHeight + 1,
      temMais: cx.classList.contains('tem-mais'),
      noFim: cx.classList.contains('no-fim'),
      /* quantas linhas cabem inteiras na janela visível */
      visiveis: linhas.filter(l => {
        const b = l.getBoundingClientRect();
        return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
      }).length,
    };
  });

  test('com seis lançamentos, só três aparecem e a lista rola', async ({ page }) => {
    await abrirApp(page, seis());
    await irAlimentacao(page);
    const c = await caixa(page);
    expect(c.linhas, 'todas continuam na lista, só não cabem na janela').toBe(6);
    expect(c.visiveis).toBe(3);
    expect(c.rolavel).toBe(true);
  });

  test('com três ou menos, nada rola e nada é cortado', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);
    await addAgua(page, 500);
    const c = await caixa(page);
    expect(c.linhas).toBe(2);
    expect(c.rolavel).toBe(false);
    expect(c.temMais, 'sem mais nada embaixo, nada a anunciar').toBe(false);
  });

  test('a barra de rolagem não aparece', async ({ page }) => {
    await abrirApp(page, seis());
    await irAlimentacao(page);
    const largura = await page.evaluate(() => {
      const l = document.querySelector('#liqHist .lh-lista');
      return l.offsetWidth - l.clientWidth;      // espaço tomado pela barra
    });
    expect(largura, 'o dedo rola; a barra não precisa ocupar espaço').toBe(0);
    expect(await page.evaluate(() =>
      getComputedStyle(document.querySelector('#liqHist .lh-lista')).scrollbarWidth)).toBe('none');
  });

  test('o esmaecido avisa que há mais, e some ao chegar no fim', async ({ page }) => {
    /* Sem barra de rolagem, uma lista cortada parece uma lista inteira. */
    await abrirApp(page, seis());
    await irAlimentacao(page);
    expect((await caixa(page)).temMais).toBe(true);
    expect((await caixa(page)).noFim).toBe(false);

    await page.evaluate(() => {
      const l = document.querySelector('#liqHist .lh-lista');
      l.scrollTop = l.scrollHeight;
      l.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    expect((await caixa(page)).noFim, 'no fim não há o que prometer').toBe(true);
  });

  test('a rolagem alcança o lançamento mais antigo', async ({ page }) => {
    await abrirApp(page, seis());
    await irAlimentacao(page);
    await page.evaluate(() => {
      const l = document.querySelector('#liqHist .lh-lista');
      l.scrollTop = l.scrollHeight;
    });
    await page.waitForTimeout(250);
    const ultimaVisivel = await page.evaluate(() => {
      const l = document.querySelector('#liqHist .lh-lista');
      const r = l.getBoundingClientRect();
      const linhas = [...l.querySelectorAll('.lh-row')];
      const dentro = linhas.filter(x => {
        const b = x.getBoundingClientRect();
        return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
      });
      return dentro.length ? dentro[dentro.length - 1].querySelector('.lh-ml').textContent.trim() : null;
    });
    expect(ultimaVisivel, 'a última linha da lista precisa ser alcançável').toBe('500 ml');
  });

  test('a altura acompanha linha alta, sem cortar a terceira ao meio', async ({ page }) => {
    /* Linha com origem ("Almoço") ocupa duas alturas de texto. Altura fixa em
       pixels cortaria a terceira linha nos dias em que houver bebida de
       refeição no topo. */
    const t = Date.now();
    const dias = {}; dias[diaISO(0)] = [
      { id: 's1', name: 'Suco de laranja', grams: 300, unit: 'ml', base: null,
        kcal: 135, p: 2, c: 31, g: 0.3, status: 'consumido', meal: 'almoco', t: t - 1000 },
      { id: 's2', name: 'Chá verde', grams: 200, unit: 'ml', base: null,
        kcal: 2, p: 0, c: 0, g: 0, status: 'consumido', meal: 'lanche', t: t - 2000 },
    ];
    const liqLog = {}; liqLog[diaISO(0)] = [
      { id: 'a1', ml: 500, t: t - 3000 }, { id: 'a2', ml: 250, t: t - 4000 },
      { id: 'a3', ml: 500, t: t - 5000 }, { id: 'a4', ml: 250, t: t - 6000 }];
    const liquids = {}; liquids[diaISO(0)] = 1500;
    await abrirApp(page, estadoBase({ days: dias, liqLog, liquids }));
    await irAlimentacao(page);

    const c = await caixa(page);
    expect(c.visiveis, 'três inteiras, nenhuma pela metade').toBe(3);
    const cortada = await page.evaluate(() => {
      const l = document.querySelector('#liqHist .lh-lista');
      const r = l.getBoundingClientRect();
      return [...l.querySelectorAll('.lh-row')].some(x => {
        const b = x.getBoundingClientRect();
        return b.top < r.bottom - 1 && b.bottom > r.bottom + 1;   // atravessa a borda
      });
    });
    expect(cortada).toBe(false);
  });

  test('excluir uma linha refaz o limite', async ({ page }) => {
    await abrirApp(page, seis());
    await irAlimentacao(page);
    expect((await caixa(page)).rolavel).toBe(true);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => document.querySelector('#liqHist [data-liqdel]').click());
      await page.waitForTimeout(200);
    }
    const c = await caixa(page);
    expect(c.linhas).toBe(2);
    expect(c.rolavel, 'sobrando duas, não há o que rolar').toBe(false);
  });
});

test.describe('Zerar a água do dia', () => {

  const responder = async (page, sim) => {
    await page.waitForSelector('#appDlgOverlay.open', { timeout: 5000 });
    await page.evaluate(v => document.getElementById(v ? 'appDlgOk' : 'appDlgCancel').click(), sim);
    await page.waitForTimeout(300);
  };

  test('zerar pergunta antes, porque o histórico vai junto', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);

    await page.evaluate(() => document.getElementById('liqReset').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.evaluate(() => document.getElementById('appDlgMsg').textContent))
      .toMatch(/histórico/i);
    await responder(page, true);

    expect(await totalNaTela(page)).toBe(0);
    expect(await page.evaluate(() => document.getElementById('liqHist').textContent))
      .toMatch(/Nada registrado neste dia/);
  });

  test('cancelar não apaga nada', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);

    await page.evaluate(() => document.getElementById('liqReset').click());
    await responder(page, false);

    expect(await totalNaTela(page)).toBe(250);
    expect((await historico(page)).length).toBe(1);
  });

  test('nunca usa o confirm do navegador', async ({ page }) => {
    /* O diálogo do navegador mostra a URL do site e destrói a sensação de app. */
    await abrirApp(page, estadoBase());
    await irAlimentacao(page);
    await addAgua(page, 250);
    let nativo = false;
    page.on('dialog', async d => { nativo = true; await d.dismiss(); });
    await page.evaluate(() => document.getElementById('liqReset').click());
    await page.waitForTimeout(400);
    expect(nativo).toBe(false);
  });
});
