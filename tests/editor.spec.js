/* Editor de treino: editar um exercício no lugar (#89).

   O pedido: "Não estou conseguindo editar o exercício, apenas excluir e
   adicionar um novo, eu devo poder editar aquele exercício pois eu posso só
   mudar o nome (ex.: ELEVAÇÃO LATERAL MÁQUINA -> ELEVAÇÃO LATERAL HALTER)".
   Excluir e adicionar de novo jogava o exercício para o fim da lista e
   perdia o que ele tinha (sinergistas ajustados, campo de versão nova). */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

const ex = (n, g, extra = {}) => ({ n, s: 3, rest: 60, g, sec: [], ...extra });
const comTreino = (exs, extra = {}) => estadoBase({
  tprotocol: [{ id: 'w1', nome: 'Treino A', cat: 'A', ex: exs }],
  ...extra,
});
const tres = () => [
  ex('Supino reto', 'peito', { sec: ['triceps'] }),
  ex('Elevação lateral máquina', 'ombro', { s: 4, rest: 75, sec: ['triceps', 'costas'], futuro: { v: 1 } }),
  ex('Tríceps corda', 'triceps'),
];

const abrirEditor = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('tOpenProtocol').click());
  await page.waitForSelector('#tprotoOverlay.open');
  await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w1"]').click());
  await page.waitForSelector('#tpEditOverlay.open');
};
const lapis = (page, i) => page.evaluate(i => document.querySelectorAll('#tpExList .ed[data-ed]')[i].click(), i);
const nomes = page => page.evaluate(() => [...document.querySelectorAll('#tpExList .pn')].map(e => e.textContent));
const form = page => page.evaluate(() => ({
  nome: document.getElementById('tpExName').value,
  s: document.getElementById('tpExS').value,
  rest: document.getElementById('tpExRest').value,
  g: document.getElementById('tpExG').value,
  syn: [...document.querySelectorAll('#tpExSyn [data-syn].on')].map(b => b.dataset.syn),
  botao: document.getElementById('tpExAdd').textContent,
  cancelar: getComputedStyle(document.getElementById('tpExCancelar')).display !== 'none',
  rotulo: document.getElementById('tpExNameLbl').textContent,
  nota: !document.getElementById('tpExNota').hidden,
  editando: [...document.querySelectorAll('#tpExList .pm-item')].map(e => e.classList.contains('editando')),
}));
const salvarAlteracao = page => page.evaluate(() => document.getElementById('tpExAdd').click());
const salvarTreino = async page => {
  await page.evaluate(() => document.getElementById('tpSave').click());
  await page.waitForTimeout(150);
};
const gravado = page => page.evaluate(() => __t.store.tprotocol.find(w => w.id === 'w1').ex);

test.describe('Editor de treino: editar exercício', () => {

  test('o lápis carrega o exercício no formulário, com grupo, séries, descanso e sinergistas', async ({ page }) => {
    const erros = await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    expect(await page.locator('#tpExList .ed').count(), 'um lápis por exercício').toBe(3);
    await lapis(page, 1);
    const f = await form(page);
    expect([f.nome, f.s, f.rest, f.g]).toEqual(['Elevação lateral máquina', '4', '75', 'ombro']);
    expect(f.syn.sort(), 'os sinergistas do exercício, não os sugeridos pelo grupo').toEqual(['costas', 'triceps']);
    expect([f.botao, f.cancelar, f.rotulo]).toEqual(['Salvar alteração', true, 'Editar exercício']);
    expect(f.editando).toEqual([false, true, false]);
    expect(f.nota, 'o nome ainda não mudou').toBe(false);
    expect(erros).toEqual([]);
  });

  test('trocar só o nome mantém a posição e o resto; salvar o treino grava', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 1);
    await page.fill('#tpExName', 'Elevação lateral halter');
    expect((await form(page)).nota, 'nome novo: a referência de carga não vem junto, e a tela diz').toBe(true);
    await salvarAlteracao(page);
    expect(await nomes(page)).toEqual(['Supino reto', 'Elevação lateral halter', 'Tríceps corda']);
    const f = await form(page);
    expect([f.nome, f.botao, f.cancelar, f.rotulo, f.nota]).toEqual(['', '＋ Adicionar exercício', false, 'Exercício', false]);
    expect(f.editando).toEqual([false, false, false]);
    expect((await gravado(page))[1].n, 'só vale depois de "Salvar treino"').toBe('Elevação lateral máquina');
    await salvarTreino(page);
    const e = (await gravado(page))[1];
    expect(e).toEqual({ n: 'Elevação lateral halter', s: 4, rest: 75, g: 'ombro', sec: ['triceps', 'costas'], futuro: { v: 1 } });
    expect((await gravado(page)).length).toBe(3);
  });

  test('séries, descanso, grupo e sinergistas também se editam', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 0);
    await page.fill('#tpExS', '5');
    await page.fill('#tpExRest', '120');
    await page.evaluate(() => document.querySelector('#tpExSyn [data-syn="triceps"]').click());   // desmarca
    await salvarAlteracao(page);
    await salvarTreino(page);
    const e = (await gravado(page))[0];
    expect([e.n, e.s, e.rest, e.g, e.sec]).toEqual(['Supino reto', 5, 120, 'peito', []]);
  });

  test('"Cancelar a edição" não muda nada e devolve o formulário de adicionar', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 1);
    await page.fill('#tpExName', 'Outro nome');
    await page.evaluate(() => document.getElementById('tpExCancelar').click());
    expect(await nomes(page)).toEqual(['Supino reto', 'Elevação lateral máquina', 'Tríceps corda']);
    const f = await form(page);
    expect([f.nome, f.s, f.rest, f.botao, f.cancelar]).toEqual(['', '4', '90', '＋ Adicionar exercício', false]);
    await salvarTreino(page);
    expect((await gravado(page)).map(e => e.n)).toEqual(['Supino reto', 'Elevação lateral máquina', 'Tríceps corda']);
  });

  test('tocar no nome do exercício também abre a edição', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await page.evaluate(() => document.querySelectorAll('#tpExList .pm-txt')[2].click());
    expect((await form(page)).nome).toBe('Tríceps corda');
  });

  test('edição não confirmada entra ao salvar o treino; sem nome, avisa e não salva', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 2);
    await page.fill('#tpExName', 'Tríceps testa');
    await salvarTreino(page);
    expect((await gravado(page)).map(e => e.n), 'a alteração não se perde calada').toEqual(['Supino reto', 'Elevação lateral máquina', 'Tríceps testa']);

    await abrirEditor(page);
    await lapis(page, 0);
    await page.fill('#tpExName', '');
    await page.evaluate(() => document.getElementById('tpSave').click());
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toMatch(/precisa de nome/);
    await page.evaluate(() => document.getElementById('appDlgOk').click());
    expect(await page.evaluate(() => document.getElementById('tpEditOverlay').classList.contains('open')), 'o editor continua aberto').toBe(true);
    expect((await gravado(page))[0].n).toBe('Supino reto');
  });

  test('excluir outro exercício durante a edição não troca o exercício errado', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 2);
    await page.fill('#tpExName', 'Tríceps francês');
    await page.evaluate(() => document.querySelectorAll('#tpExList .rm[data-i]')[0].click());   // sai o de cima
    expect((await form(page)).editando, 'a marca acompanha o exercício').toEqual([false, true]);
    await salvarAlteracao(page);
    expect(await nomes(page)).toEqual(['Elevação lateral máquina', 'Tríceps francês']);
  });

  test('excluir o exercício em edição encerra a edição', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 1);
    await page.evaluate(() => document.querySelectorAll('#tpExList .rm[data-i]')[1].click());
    const f = await form(page);
    expect([f.nome, f.botao, f.cancelar]).toEqual(['', '＋ Adicionar exercício', false]);
    await page.fill('#tpExName', 'Remada curvada');
    await salvarAlteracao(page);
    expect(await nomes(page), 'depois, o botão volta a acrescentar').toEqual(['Supino reto', 'Tríceps corda', 'Remada curvada']);
  });

  test('reabrir o editor começa no modo de adicionar', async ({ page }) => {
    await abrirApp(page, comTreino(tres()));
    await abrirEditor(page);
    await lapis(page, 1);
    await page.evaluate(() => document.getElementById('tpCancel').click());
    await page.evaluate(() => document.querySelector('#tprotoList [data-ted="w1"]').click());
    await page.waitForSelector('#tpEditOverlay.open');
    const f = await form(page);
    expect([f.nome, f.botao, f.cancelar]).toEqual(['', '＋ Adicionar exercício', false]);
    expect(f.editando).toEqual([false, false, false]);
  });

  test('o histórico continua no nome antigo: o exercício renomeado começa sem a referência', async ({ page }) => {
    const ontem = new Date(Date.now() - 86400000);
    const dk = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
    await abrirApp(page, comTreino(tres(), {
      tdays: { [dk]: [{ id: 's1', name: 'Treino A', tid: 'w1', min: 40, kcal: 200, vol: 300, ex: [{ n: 'Elevação lateral máquina', g: 'ombro', sec: [], sets: [{ kg: 30, rep: 10, rir: 2 }] }] }] },
    }));
    await abrirEditor(page);
    await lapis(page, 1);
    await page.fill('#tpExName', 'Elevação lateral halter');
    await salvarAlteracao(page);
    await salvarTreino(page);
    const ref = await page.evaluate(() => [__t.lastExSession('Elevação lateral halter', ''), !!__t.lastExSession('Elevação lateral máquina', '')]);
    expect(ref).toEqual([null, true]);
  });

  test('em 320 px a linha com lápis, vídeo e excluir cabe, sem rolagem de lado', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await abrirApp(page, comTreino([ex('Elevação lateral máquina com pegada neutra unilateral', 'ombro'), ...tres()]));
    await abrirEditor(page);
    await lapis(page, 0);
    const m = await page.evaluate(() => {
      const ov = document.querySelector('#tpEditOverlay .sheet') || document.getElementById('tpEditOverlay');
      const linhas = [...document.querySelectorAll('#tpExList .pm-item')].map(r => {
        const b = r.getBoundingClientRect();
        const filhos = [...r.children].map(c => c.getBoundingClientRect());
        return { dir: b.right, filhosDir: Math.max(...filhos.map(f => f.right)) };
      });
      return { largura: document.documentElement.clientWidth, rola: document.documentElement.scrollWidth > document.documentElement.clientWidth, ovRola: ov.scrollWidth > ov.clientWidth + 1, linhas };
    });
    expect(m.rola).toBe(false);
    expect(m.ovRola).toBe(false);
    for (const l of m.linhas) expect(l.filhosDir).toBeLessThanOrEqual(l.dir + 0.5);
  });
});
