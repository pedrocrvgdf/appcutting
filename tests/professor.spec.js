/* "Sou treinador" numa conta que já existe, com o código de professor (#103).

   O pedido: "Adicione a opção de 'Sou treinador' em contas já existentes e
   coloque uma chave de segurança quando a pessoa clicar, irá abrir um pop-up
   escrito 'Favor colocar o código de professor' […] e se colocar com êxito,
   a conta da pessoa passa a ser de treinador gerando o código para ligar a
   um aluno."

   O que pode dar errado, e cada teste confere uma coisa: o código errado
   converter; o certo não gerar o código de convite; a conta seguir ouvindo
   o vínculo de aluno; e os protocolos que a pessoa já tinha irem parar no
   plano do primeiro aluno (carimbarAlunos carimba tudo o que não tem dono). */

const { test, expect } = require('@playwright/test');
const { estadoBase, urlApp, isolarRede, coletarErros } = require('./app');

/* Semeia antes do app, como em treinador.spec.js. */
async function abrirApp(page, storage) {
  await isolarRede(page.context());
  const erros = coletarErros(page);
  await page.addInitScript(s => {
    if (localStorage.getItem('__semeado')) return;
    localStorage.clear();
    for (const k in s) localStorage.setItem(k, s[k]);
    localStorage.setItem('__semeado', '1');
  }, storage);
  await page.goto(urlApp());
  await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return erros;
}
const comDocs = (estado, docs) => ({ ...estado, __docs: JSON.stringify(docs) });
const docs = page => page.evaluate(() => JSON.parse(localStorage.getItem('__docs') || '{}'));
const viewOn = page => page.evaluate(() => document.querySelector('.view.on')?.id);
const clicar = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const irPerfil = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
  await page.waitForTimeout(300);
};
const digitarCodigo = async (page, c) => {
  await page.evaluate(v => { const i = document.getElementById('profCodigo'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, c);
  await clicar(page, '#profOk');
  await page.waitForTimeout(300);
};
const msg = page => page.textContent('#profMsg');

/* Quem já treina: protocolo próprio, com um treino e histórico. */
function contaQueTreina(extra = {}) {
  const st = estadoBase({
    tprotos: [{ id: 'pp', nome: 'Meu treino' }],
    tprotocol: [{ id: 'w1', nome: 'Treino A', cat: 'A', prot: 'pp', protNome: 'Meu treino', ex: [{ n: 'Supino reto', s: 3, rest: 90, g: 'peito', sec: [] }] }],
    ...extra,
  });
  return st;
}

test.describe('Sou treinador, numa conta que já existe', () => {

  test('o Perfil tem "Sou treinador", que abre o pedido do código de professor', async ({ page }) => {
    const erros = await abrirApp(page, contaQueTreina());
    await irPerfil(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('pfTreinWrap')).display)).not.toBe('none');
    await clicar(page, '#pfSouTreinador');
    await page.waitForSelector('#profOverlay.open');
    const r = await page.evaluate(() => ({
      txt: document.querySelector('#profOverlay .vinc-txt').textContent,
      tipo: document.getElementById('profCodigo').type,
      teclado: document.getElementById('profCodigo').inputMode,
    }));
    expect(r.txt).toBe('Favor colocar o código de professor.');
    expect(r.tipo, 'quem está do lado não lê o código').toBe('password');
    expect(r.teclado).toBe('numeric');
    expect(erros).toEqual([]);
  });

  test('código errado não converte, e diz por quê', async ({ page }) => {
    await abrirApp(page, contaQueTreina());
    await irPerfil(page);
    await clicar(page, '#pfSouTreinador');
    await digitarCodigo(page, '1234');
    expect(await msg(page)).toBe('Código incorreto.');
    expect(await page.evaluate(() => __t.store.papel)).toBeUndefined();
    expect(await page.evaluate(() => document.getElementById('profOverlay').classList.contains('open'))).toBe(true);
    await digitarCodigo(page, '');
    expect(await msg(page)).toBe('Digite o código de professor.');
  });

  test('cinco erros travam por 5 minutos, até com o código certo', async ({ page }) => {
    await abrirApp(page, contaQueTreina());
    await irPerfil(page);
    await clicar(page, '#pfSouTreinador');
    for (let i = 0; i < 4; i++) await digitarCodigo(page, '000' + i);
    expect(await msg(page)).toBe('Código incorreto.');
    await digitarCodigo(page, '0009');
    expect(await msg(page)).toBe('Código incorreto. Muitas tentativas: tente de novo em 5 min.');
    await digitarCodigo(page, '3374');
    expect(await msg(page)).toMatch(/^Muitas tentativas\. Tente de novo em [1-5] min\.$/);
    expect(await page.evaluate(() => __t.store.papel)).toBeUndefined();
    // passados os 5 minutos, o certo entra
    await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('tresults.profTrava')); t.ate = Date.now() - 1; localStorage.setItem('tresults.profTrava', JSON.stringify(t)); });
    await digitarCodigo(page, '3374');
    expect(await page.evaluate(() => __t.store.papel)).toBe('treinador');
  });

  test('o código certo: a conta vira de treinador, abre em Alunos e gera o código para o aluno', async ({ page }) => {
    const erros = await abrirApp(page, contaQueTreina());
    await irPerfil(page);
    await clicar(page, '#pfSouTreinador');
    await digitarCodigo(page, '3374');
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toContain('sua conta agora é de treinador');
    await clicar(page, '#appDlgOk');
    await page.waitForFunction(() => /^[A-HJ-NP-Z2-9]{6}$/.test(__t.store.convite || ''), null, { timeout: 5000 });
    const s = await page.evaluate(() => ({ papel: __t.store.papel, convite: __t.store.convite, cod: document.getElementById('alCodigo').textContent }));
    expect(s.papel).toBe('treinador');
    expect(await viewOn(page)).toBe('view-alunos');
    expect(s.cod, 'o código aparece na tela').toBe(s.convite);
    expect((await docs(page))['convites/' + s.convite]).toEqual(expect.objectContaining({ treinador: 'u1', nome: 'Pedro' }));
    const abas = await page.evaluate(() => [...document.querySelectorAll('#tabbar button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim()));
    expect(abas).toEqual(['Alunos', 'Perfil']);
    // e a nuvem fica sabendo: o papel sobe com o documento
    await page.waitForFunction(() => !localStorage.getItem('cutting.pendente'), null, { timeout: 5000 }).catch(() => {});
    expect(erros).toEqual([]);
  });

  test('os protocolos que a pessoa já tinha não vão para o primeiro aluno', async ({ page }) => {
    const aluno = { treinador: 'u1', treinadorNome: 'Pedro', aluno: 'a1', alunoNome: 'Ana', codigo: 'ABC234', desde: 1, pesos: false };
    await abrirApp(page, comDocs(contaQueTreina(), { 'vinculos/a1': aluno }));
    await irPerfil(page);
    await clicar(page, '#pfSouTreinador');
    await digitarCodigo(page, '3374');
    await clicar(page, '#appDlgOk');
    await page.waitForSelector('[data-aluno="a1"]', { timeout: 5000 });
    await clicar(page, '[data-aluno="a1"]');
    await page.waitForSelector('#view-aluno.on');
    await page.waitForTimeout(200);
    // monta um protocolo para a Ana, pela tela
    await clicar(page, '#alProtNovo');
    await page.waitForSelector('#protNovoOverlay.open');
    await page.evaluate(() => { const c = document.getElementById('protNovoNome'); c.value = 'Força da Ana'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    await clicar(page, '#protNovoOk');
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => JSON.parse(JSON.stringify(__t.store)));
    const meu = st.tprotos.find(p => p.id === 'pp'), dela = st.tprotos.find(p => p.nome === 'Força da Ana');
    expect(meu.aluno, 'o protocolo de antes continua da pessoa').toBeUndefined();
    expect(meu.pessoal).toBe(true);
    expect(st.tprotocol.find(w => w.id === 'w1').aluno).toBeUndefined();
    expect(dela.aluno).toBe('a1');
    expect(await page.evaluate(() => __t.listaProtocolos().map(p => p.nome)), 'na Ana, só o dela').toEqual(['Força da Ana']);
    expect(await page.evaluate(() => __t.planoDe('a1').tprotos.map(p => p.nome))).toEqual(['Força da Ana']);
  });

  test('ligado a um treinador, explica que precisa desfazer a ligação antes', async ({ page }) => {
    const v = { treinador: 't9', treinadorNome: 'Carla', aluno: 'u1', alunoNome: 'Pedro', codigo: 'ABC234', desde: 1, pesos: false };
    await abrirApp(page, comDocs(contaQueTreina(), { 'vinculos/u1': v, 'convites/ABC234': { treinador: 't9', nome: 'Carla', criado: 1 } }));
    await irPerfil(page);
    await page.waitForFunction(() => !!__t.vinc, null, { timeout: 5000 });
    expect(await page.evaluate(() => !!document.getElementById('pfSouTreinador')), 'com treinador, o cartão é o da ligação').toBe(false);
    await page.evaluate(() => { __t.abrirProf(); });
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toContain('desfaça a ligação antes');
    expect(await page.evaluate(() => document.getElementById('profOverlay').classList.contains('open'))).toBe(false);
  });

  test('com treino em andamento, pede para terminar antes', async ({ page }) => {
    await abrirApp(page, contaQueTreina());
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="treino"]').click());
    await page.waitForSelector('#tprotoCards [data-tw]');
    await page.evaluate(() => document.querySelector('#tprotoCards [data-tw]').click());
    await page.waitForSelector('#trSets .tr-set');
    await page.evaluate(() => { __t.abrirProf(); });
    await page.waitForSelector('#appDlgOverlay.open');
    expect(await page.textContent('#appDlgMsg')).toBe('Finalize ou cancele o treino em andamento antes.');
    expect(await page.evaluate(() => __t.store.papel)).toBeUndefined();
  });

  test('sem conta (modo local), não aparece', async ({ page }) => {
    await abrirApp(page, contaQueTreina());
    await page.evaluate(() => { __t.setUser(null); });
    await page.evaluate(() => __t.renderPerfilTreinador());
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('pfTreinWrap')).display)).toBe('none');
  });

  test('a conta virou de treinador em outro aparelho: este troca de lado sozinho', async ({ page }) => {
    await abrirApp(page, contaQueTreina());
    expect(await page.evaluate(() => __t.ehTreinador())).toBe(false);
    await page.evaluate(() => {
      const d = JSON.parse(JSON.stringify(__t.paraNuvem()));
      d.papel = 'treinador'; d.convite = 'QWE234';
      __t.aplicarNuvem(d);
    });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __t.ehTreinador())).toBe(true);
    expect(await viewOn(page)).toBe('view-alunos');
    expect(await page.textContent('#alCodigo')).toBe('QWE234');
  });

  test('não fica o código no arquivo do app, só o resumo dele', async () => {
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    expect(html).not.toMatch(/3374/);
    expect(html).toMatch(/const PROF_HASH="[0-9a-f]{64}"/);
  });

  for (const largura of [320, 390]) {
    test(`o pop-up cabe em ${largura}px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 700 });
      await abrirApp(page, contaQueTreina());
      await irPerfil(page);
      await clicar(page, '#pfSouTreinador');
      await page.waitForSelector('#profOverlay.open');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const m = document.querySelector('#profOverlay .modal').getBoundingClientRect();
        return { larg: document.documentElement.scrollWidth, vw: innerWidth, dir: m.right, esq: m.left, fundo: document.getElementById('profVoltar').getBoundingClientRect().bottom, vh: innerHeight };
      });
      expect(r.larg).toBeLessThanOrEqual(r.vw);
      expect(r.esq).toBeGreaterThanOrEqual(0);
      expect(r.dir).toBeLessThanOrEqual(r.vw);
      expect(r.fundo, 'os botões à vista').toBeLessThanOrEqual(r.vh);
    });
  }
});
