/* Exportar o protocolo em PDF (#92).

   O pedido: "Coloque a opção de exportar o protocolo em pdf". A folha é
   montada em #printArea e vai para a impressão do sistema, que tem "Salvar
   como PDF": no navegador, window.print(); no app Android, a ponte
   (TResults.imprimir), porque o WebView ignora window.print(). Os riscos:
   a folha sair com a página inteira (ou só a primeira página), o tema escuro
   imprimir texto claro, um nome com HTML virar marcação, dado de saúde ir
   junto, e o botão não fazer nada no app com o APK antigo. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

const ex = (n, g, extra = {}) => ({ n, s: 3, rest: 90, g, sec: [], ...extra });
const doisTreinos = (extra = {}) => estadoBase({
  tprotos: [{ id: 'principal', nome: 'Hipertrofia' }, { id: 'p2', nome: 'Viagem' }],
  tprotocol: [
    { id: 'w1', nome: 'Peito e tríceps', cat: 'A', ex: [ex('Supino reto', 'peito', { s: 4, rest: 120, sec: ['triceps', 'ombro'] }), ex('Paralela livre', 'triceps', { rest: 75 }), ex('Prancha', 'abdomen', { s: 2, rest: 45 })] },
    { id: 'w2', nome: 'Costas e bíceps', cat: 'B', ex: [ex('Barra fixa', 'costas'), ex('Barra fixa assistida', 'costas'), ex('Rosca direta', 'biceps')] },
    { id: 'w3', nome: 'Hotel', cat: 'A', prot: 'p2', protNome: 'Viagem', ex: [ex('Flexão de braço', 'peito')] },
  ],
  ...extra,
});
const PRINT = () => {
  window.__impressoes = [];
  window.print = () => window.__impressoes.push({ titulo: document.title });
};
const abrirProtocolo = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('tOpenProtocol').click());
  await page.waitForSelector('#tprotoOverlay.open');
};
const exportar = page => page.evaluate(() => document.getElementById('tpPdf').click());
/* A folha fica escondida na tela (innerText sem quebras): lida pela estrutura. */
const folha = page => page.evaluate(() => {
  const pa = document.getElementById('printArea'), t = el => el ? el.textContent.trim() : '';
  return {
    titulo: t(pa.querySelector('h1')), sub: t(pa.querySelector('.pa-sub')),
    treinos: [...pa.querySelectorAll('.pa-treino')].map(s => ({
      nome: t(s.querySelector('h2')), meta: t(s.querySelector('.pa-meta')),
      linhas: [...s.querySelectorAll('tbody tr')].map(r => [...r.children].map(td => {
        const ex = td.querySelector('.pa-ex'), tag = td.querySelector('.pa-tag');
        return ex ? (tag ? `${t(ex)} [${t(tag)}]` : t(ex)) : t(td);
      })),
    })),
    texto: pa.textContent,
  };
});

test.describe('Exportar o protocolo em PDF', () => {

  test('o botão abre a impressão com a folha do protocolo aberto, na ordem, e devolve o título', async ({ page }) => {
    await page.addInitScript(PRINT);
    const erros = await abrirApp(page, doisTreinos());
    await abrirProtocolo(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('tpPdf')).display)).not.toBe('none');
    await exportar(page);
    const imp = await page.evaluate(() => window.__impressoes);
    expect(imp.length).toBe(1);
    expect(imp[0].titulo, 'o título vira o nome do arquivo').toBe('Protocolo Hipertrofia');
    const f = await folha(page);
    expect(f.titulo).toBe('Hipertrofia');
    expect(f.sub).toMatch(/^2 treinos · exportado em \d\d\/\d\d\/\d{4}$/);
    expect(f.texto).not.toContain('Hotel');   // o outro protocolo fica de fora
    expect(f.treinos).toEqual([
      { nome: 'Peito e tríceps', meta: 'Treino A · 3 exercícios · 9 séries', linhas: [
        ['1', 'Supino reto', 'Peito (+Tríceps, Ombro)', '4', '120 s'],
        ['2', 'Paralela livre [peso do corpo]', 'Tríceps', '3', '75 s'],
        ['3', 'Prancha [por tempo]', 'Abdômen', '2', '45 s'],
      ] },
      { nome: 'Costas e bíceps', meta: 'Treino B · 3 exercícios · 9 séries', linhas: [
        ['1', 'Barra fixa [peso do corpo]', 'Costas', '3', '90 s'],
        ['2', 'Barra fixa assistida [peso do corpo, com contrapeso]', 'Costas', '3', '90 s'],
        ['3', 'Rosca direta', 'Bíceps', '3', '90 s'],
      ] },
    ]);
    // depois da impressão, o título da página volta
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await page.evaluate(() => document.title)).not.toBe('Protocolo Hipertrofia');
    expect(erros).toEqual([]);
  });

  test('protocolo sem treino não tem o botão', async ({ page }) => {
    const e = doisTreinos({ tprotos: [{ id: 'principal', nome: 'Hipertrofia' }, { id: 'p2', nome: 'Viagem' }, { id: 'p3', nome: 'Vazio' }] });
    e['tresults.prot'] = 'p3';
    await abrirApp(page, e);
    await abrirProtocolo(page);
    const r = await page.evaluate(() => [document.getElementById('tpProtNome').value, getComputedStyle(document.getElementById('tpPdf')).display, getComputedStyle(document.getElementById('tpPdfNota')).display]);
    expect(r).toEqual(['Vazio', 'none', 'none']);
  });

  test('o nome digitado no título e ainda não gravado vai para a folha', async ({ page }) => {
    await page.addInitScript(PRINT);
    await abrirApp(page, doisTreinos());
    await abrirProtocolo(page);
    await page.fill('#tpProtNome', 'Força 2026');
    await exportar(page);
    const imp = await page.evaluate(() => window.__impressoes[0]);
    expect([imp.titulo, (await folha(page)).titulo]).toEqual(['Protocolo Força 2026', 'Força 2026']);
    expect(await page.evaluate(() => __t.store.tprotos.find(p => p.id === 'principal').nome)).toBe('Força 2026');
  });

  test('nome com HTML sai como texto, e nada de saúde ou do perfil entra na folha', async ({ page }) => {
    await page.addInitScript(PRINT);
    const e = doisTreinos({
      tprotocol: [{ id: 'w1', nome: '<b>Treino</b> & cia', cat: 'A', ex: [ex('<img src=x onerror=alert(1)>Supino', 'peito')] }],
    });
    const st = JSON.parse(e['cutting.v1']);
    st.goals.exog = ['clembuterol']; st.goals.clenDose = 80;
    st.weights = [{ d: '2026-01-01', w: 83.7 }];
    e['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, e);
    await abrirProtocolo(page);
    await exportar(page);
    const r = await page.evaluate(() => ({ imgs: document.querySelectorAll('#printArea img, #printArea b').length, txt: document.getElementById('printArea').textContent }));
    expect(r.imgs).toBe(0);
    expect(r.txt).toContain('<b>Treino</b> & cia');
    expect(r.txt).toContain('<img src=x onerror=alert(1)>Supino');
    for (const proibido of ['Pedro', 'clembuterol', '83,7', '83.7', 'kg']) expect(r.txt, proibido).not.toContain(proibido);
  });

  test('com academias, cada treino diz onde vale', async ({ page }) => {
    await page.addInitScript(PRINT);
    const e = doisTreinos({ academias: [{ id: 'a1', nome: 'Smart Fit' }, { id: 'a2', nome: 'Prédio' }] });
    const st = JSON.parse(e['cutting.v1']);
    st.tprotocol[0].acads = ['a1'];
    e['cutting.v1'] = JSON.stringify(st);
    await abrirApp(page, e);
    await page.evaluate(() => localStorage.setItem('tresults.acad', 'a1'));
    await abrirProtocolo(page);
    await exportar(page);
    const f = await folha(page);
    expect(f.treinos.map(t => t.meta)).toEqual(['Treino A · 3 exercícios · 9 séries · Smart Fit', 'Treino B · 3 exercícios · 9 séries · todas as academias']);
  });

  test('na impressão só a folha aparece, com tinta escura até no tema escuro', async ({ page }) => {
    await page.addInitScript(PRINT);
    await page.addInitScript(() => localStorage.setItem('tresults.theme', 'dark'));
    await abrirApp(page, doisTreinos());
    await abrirProtocolo(page);
    await exportar(page);
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => {
      const vis = el => !!el && getComputedStyle(el).display !== 'none';
      const corpo = [...document.body.children].filter(c => c.id !== 'printArea' && c.tagName !== 'SCRIPT');
      const pa = document.getElementById('printArea');
      return {
        folha: vis(pa), outros: corpo.filter(vis).map(c => c.id || c.className || c.tagName),
        cor: getComputedStyle(pa).color, fundo: getComputedStyle(document.body).backgroundColor,
        alturaLivre: getComputedStyle(document.body).overflow,
        /* com o esquema escuro, o Chrome pintava de grafite a margem da folha */
        esquema: getComputedStyle(document.documentElement).colorScheme,
      };
    });
    expect(r.folha).toBe(true);
    expect(r.outros, 'o resto da página some').toEqual([]);
    expect(r.cor).toBe('rgb(20, 20, 20)');
    expect(r.fundo).toBe('rgb(255, 255, 255)');
    expect(r.alturaLivre).toBe('visible');
    expect(r.esquema).toMatch(/^(only light|light only)$/);
    await page.emulateMedia({ media: 'screen' });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('printArea')).display), 'na tela, a folha não aparece').toBe('none');
  });

  test('o PDF sai com a folha, em mais de uma página quando o protocolo é longo', async ({ page }) => {
    await page.addInitScript(PRINT);
    const muitos = Array.from({ length: 8 }, (_, i) => ({ id: 'w' + i, nome: 'Treino ' + 'ABCDEFGH'[i], cat: 'ABCDEFGH'[i], ex: Array.from({ length: 8 }, (_, j) => ex('Exercício ' + (j + 1), 'peito')) }));
    await abrirApp(page, estadoBase({ tprotocol: muitos }));
    await abrirProtocolo(page);
    await exportar(page);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(paginas, 'a altura presa do app não corta o PDF na primeira página').toBeGreaterThan(1);
  });

  test('no app Android, quem imprime é a ponte, com o título', async ({ page }) => {
    await page.addInitScript(PRINT);
    await page.addInitScript(() => {
      window.__ponte = [];
      window.TResults = { disponivel: () => true, versao: () => '1.6', imprimir: t => window.__ponte.push(t) };
    });
    await abrirApp(page, doisTreinos());
    await abrirProtocolo(page);
    await exportar(page);
    expect(await page.evaluate(() => [window.__ponte, window.__impressoes.length])).toEqual([['Protocolo Hipertrofia'], 0]);
    expect((await folha(page)).treinos[0].nome, 'a folha já está montada quando a ponte imprime').toBe('Peito e tríceps');
  });

  test('no app com o APK antigo, sem a ponte de impressão, o app avisa para atualizar', async ({ page }) => {
    await page.addInitScript(PRINT);
    await page.addInitScript(() => { window.TResults = { disponivel: () => true, versao: () => '1.5' }; });
    await abrirApp(page, doisTreinos());
    await abrirProtocolo(page);
    await exportar(page);
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgTitle')).toBe('Atualize o app');
    expect(await page.evaluate(() => window.__impressoes.length)).toBe(0);
  });

  test('em 320 px o botão e a nota cabem no pop-up', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await abrirApp(page, doisTreinos());
    await abrirProtocolo(page);
    const m = await page.evaluate(() => {
      const b = document.getElementById('tpPdf').getBoundingClientRect(), n = document.getElementById('tpPdfNota').getBoundingClientRect();
      return { rola: document.documentElement.scrollWidth > document.documentElement.clientWidth, b: b.right <= 320 && b.width > 200, n: n.right <= 320 };
    });
    expect(m).toEqual({ rola: false, b: true, n: true });
  });
});
