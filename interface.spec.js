/* O T-RESULTS é um app, não um site: sem zoom, sem seleção de texto da
   interface e sem os diálogos do navegador. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase, iniciarTreino } = require('./app');

test.describe('Comportamento de app', () => {

  test('zoom está bloqueado nas três formas', async ({ page }) => {
    await abrirApp(page, estadoBase());

    const css = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).touchAction,
      elemento: getComputedStyle(document.querySelector('.card') || document.body).touchAction,
    }));
    expect(css.html, 'pinça e toque duplo').toBe('pan-x pan-y');
    expect(css.elemento).toBe('manipulation');

    const gestos = await page.evaluate(() => {
      const roda = new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, cancelable: true, bubbles: true });
      window.dispatchEvent(roda);
      const pinca = new Event('gesturestart', { cancelable: true, bubbles: true });
      document.dispatchEvent(pinca);
      return { roda: roda.defaultPrevented, pinca: pinca.defaultPrevented };
    });
    expect(gestos.roda, 'Ctrl + roda no computador').toBe(true);
    expect(gestos.pinca, 'gesto de pinça do iOS').toBe(true);
  });

  test('interface não é selecionável, mas os campos continuam sendo', async ({ page }) => {
    await abrirApp(page, estadoBase());

    const estado = await page.evaluate(() => {
      const menu = new Event('contextmenu', { cancelable: true, bubbles: true });
      document.body.dispatchEvent(menu);
      const cs = getComputedStyle(document.body);
      return {
        interface: cs.userSelect || cs.webkitUserSelect,
        campo: getComputedStyle(document.getElementById('getdInput')).userSelect,
        menuBloqueado: menu.defaultPrevented,
        overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
      };
    });

    expect(estado.interface).toBe('none');
    expect(estado.campo, 'digitação precisa continuar selecionável').toBe('text');
    expect(estado.menuBloqueado, 'menu de toque longo').toBe(true);
    expect(estado.overscroll, 'efeito elástico de rolagem').toBe('none');
  });

  test('confirmações aparecem dentro do app, nunca no navegador', async ({ page }) => {
    let nativo = false;
    page.on('dialog', async d => { nativo = true; await d.dismiss(); });

    const erros = await abrirApp(page, estadoBase());
    await iniciarTreino(page);
    await page.evaluate(() => document.getElementById('trQuit').click());
    await page.waitForTimeout(300);

    const dlg = await page.evaluate(() => ({
      aberto: document.getElementById('appDlgOverlay').classList.contains('open'),
      msg: document.getElementById('appDlgMsg').textContent,
      ok: document.getElementById('appDlgOk').textContent,
      cancelar: document.getElementById('appDlgCancel').textContent,
    }));

    expect(nativo, 'alert/confirm do navegador não podem ser usados').toBe(false);
    expect(dlg.aberto).toBe(true);
    expect(dlg.msg).toMatch(/Cancelar o treino/);
    expect(dlg.ok, 'rótulos em pt-BR, não OK/Cancel').toBe('Sim, cancelar');
    expect(dlg.cancelar).toBe('Continuar treino');

    // cancelar mantém o treino rodando
    await page.evaluate(() => document.getElementById('appDlgCancel').click());
    await page.waitForTimeout(200);
    const depois = await page.evaluate(() => ({
      fechou: !document.getElementById('appDlgOverlay').classList.contains('open'),
      treino: document.getElementById('tRunOverlay').classList.contains('open'),
    }));
    expect(depois.fechou).toBe(true);
    expect(depois.treino, 'voltar não pode cancelar o treino').toBe(true);
    expect(erros).toEqual([]);
  });

  test('abre sem erro de JavaScript', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await page.waitForTimeout(600);
    expect(erros).toEqual([]);
    expect(await page.evaluate(() => document.querySelector('.view.on')?.id)).toBe('view-food');
  });
});

/* O layout já quebrou em 320px: o rótulo virava "S..." e a linha de
   referência se despedaçava. */
for (const largura of [390, 320]) {
  test(`layout do treino não estoura em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 844 });
    await abrirApp(page, estadoBase());
    await iniciarTreino(page);

    const estouro = await page.evaluate(() => {
      const modal = document.querySelector('#tRunOverlay .modal');
      return {
        horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        modalEstoura: modal.scrollWidth > modal.clientWidth + 1,
      };
    });

    expect(estouro.horizontal, 'a página não pode rolar para o lado').toBe(false);
    expect(estouro.modalEstoura, 'a tela de treino não pode transbordar').toBe(false);
  });
}

for (const tema of ['light', 'dark']) {
  test(`tema ${tema} aplica as cores do app`, async ({ page }) => {
    const storage = estadoBase();
    storage['tresults.theme'] = tema;
    await abrirApp(page, storage);

    const cores = await page.evaluate(() => ({
      escuro: document.documentElement.getAttribute('data-theme') === 'dark',
      fundo: getComputedStyle(document.body).backgroundColor,
    }));

    expect(cores.escuro).toBe(tema === 'dark');
    expect(cores.fundo, 'o fundo precisa ser pintado explicitamente').not.toBe('rgba(0, 0, 0, 0)');
  });
}
