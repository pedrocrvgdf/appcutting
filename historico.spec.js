/* Referência da última sessão: ao preencher uma série, o app mostra quanto foi
   levantado na mesma série da última vez, para decidir a progressão de carga. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino, preencherSerie, diaISO } = require('./app');

/* Supino feito duas vezes: há 12 dias com carga menor e há 5 dias com a atual.
   A referência tem que ser sempre a mais recente. */
function comHistorico() {
  return estadoBase({
    tprotocol: [{
      id: 'w1', nome: 'Treino A', cat: 'A', ex: [
        { n: 'Supino reto', s: 3, rest: 90, g: 'peito', sec: [] },
        { n: 'Crucifixo inclinado', s: 3, rest: 60, g: 'peito', sec: [] }, // nunca feito
      ],
    }],
    tdays: {
      [diaISO(12)]: [{
        id: 'a', name: 'Treino A', min: 50, kcal: 300, vol: 1000, intens: 'moderada', rir: 2,
        ex: [{ n: 'Supino reto', g: 'peito', sec: [], sets: [
          { kg: 50, rep: 10, rir: 2 }, { kg: 50, rep: 9, rir: 1 }, { kg: 45, rep: 8, rir: 1 },
        ] }],
      }],
      [diaISO(5)]: [{
        id: 'b', name: 'Treino A', min: 52, kcal: 320, vol: 1200, intens: 'intensa', rir: 1,
        ex: [{ n: 'Supino reto', g: 'peito', sec: [], sets: [
          { kg: 57.5, rep: 10, rir: 1 }, { kg: 57.5, rep: 8, rir: 0 }, { kg: 52.5, rep: 8, rir: 1 },
        ] }],
      }],
    },
  });
}

test.describe('Referência da última sessão', () => {

  test('mostra carga, reps e RIR de cada série da vez anterior', async ({ page }) => {
    const erros = await abrirApp(page, comHistorico());
    await iniciarTreino(page);

    const linhas = await page.evaluate(() =>
      [...document.querySelectorAll('#trSets .tsprev')].map(x => x.textContent.trim()));

    expect(linhas, 'uma referência por série').toHaveLength(3);
    expect(linhas[0]).toMatch(/57,5 kg × 10/);
    expect(linhas[0]).toMatch(/RIR 1/);
    expect(linhas[1]).toMatch(/57,5 kg × 8/);
    expect(linhas[2], 'cada série mostra a carga dela, não a da primeira').toMatch(/52,5 kg × 8/);
    expect(erros).toEqual([]);
  });

  test('usa a sessão mais recente, não a mais antiga', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await iniciarTreino(page);

    const ref = await page.evaluate(() => __t.lastExSession('Supino reto'));

    expect(ref.sets[0].kg, 'deveria pegar a de 5 dias (57,5) e não a de 12 (50)').toBe(57.5);
    expect(ref.dk).toBe(await page.evaluate(() => __t.lastExSession('Supino reto').dk));
  });

  test('sugere os valores anteriores nos campos vazios', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await iniciarTreino(page);

    const sugestoes = await page.evaluate(() =>
      [...document.querySelectorAll('#trSets .tr-set')].map(r =>
        r.querySelector('.ikg').placeholder + '/' + r.querySelector('.irep').placeholder));

    expect(sugestoes).toEqual(['57,5/10', '57,5/8', '52,5/8']);
  });

  test('mostra a diferença de carga conforme você digita', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await iniciarTreino(page);

    const ler = () => page.evaluate(() => {
      const c = document.querySelector('#trSets .tr-set[data-i="0"] .tp-d');
      return { txt: c.textContent, cls: c.className };
    });

    await preencherSerie(page, 0, 60);
    expect(await ler()).toMatchObject({ txt: '+2,5 kg' });
    expect((await ler()).cls).toMatch(/up/);

    await preencherSerie(page, 0, 57.5);
    expect((await ler()).txt).toBe('mesma carga');

    await preencherSerie(page, 0, 55);
    expect(await ler()).toMatchObject({ txt: '-2,5 kg' });
    expect((await ler()).cls).toMatch(/down/);

    await preencherSerie(page, 0, '');
    expect((await ler()).txt, 'campo vazio não mostra diferença').toBe('');
  });

  test('exercício nunca feito não inventa referência', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(200);

    const estado = await page.evaluate(() => ({
      nome: document.getElementById('trExName').textContent,
      ref: __t.lastExSession('Crucifixo inclinado'),
      linhas: document.querySelectorAll('#trSets .tsprev').length,
      sugestoes: [...document.querySelectorAll('#trSets .ikg')].map(i => i.placeholder),
    }));

    expect(estado.nome).toBe('Crucifixo inclinado');
    expect(estado.ref).toBeNull();
    expect(estado.linhas).toBe(0);
    expect(estado.sugestoes.every(p => p === '0')).toBe(true);
  });

  test('mantém a referência ao voltar para o exercício anterior', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trNext').click());
    await page.waitForTimeout(150);
    await page.evaluate(() => document.getElementById('trPrev').click());
    await page.waitForTimeout(150);

    const linhas = await page.evaluate(() =>
      [...document.querySelectorAll('#trSets .tsprev')].map(x => x.textContent.trim()));

    expect(linhas[0]).toMatch(/57,5 kg × 10/);
  });

  test('cargas com meio quilo cabem no campo, sem cortar', async ({ page }) => {
    await abrirApp(page, comHistorico());
    await iniciarTreino(page);

    // largura do conteúdo tem que comportar "102,5" (5 caracteres)
    const cabe = await page.evaluate(() => {
      const inp = document.querySelector('#trSets .ikg');
      inp.value = '102,5';
      const estilo = getComputedStyle(inp);
      const util = inp.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
      const medidor = document.createElement('span');
      medidor.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${estilo.font}`;
      medidor.textContent = '102,5';
      document.body.appendChild(medidor);
      const largura = medidor.getBoundingClientRect().width;
      medidor.remove();
      return { util, largura };
    });

    expect(cabe.largura, `"102,5" ocupa ${cabe.largura.toFixed(1)}px e o campo tem ${cabe.util.toFixed(1)}px úteis`)
      .toBeLessThanOrEqual(cabe.util);
  });
});
