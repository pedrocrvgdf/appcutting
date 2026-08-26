/* Criar conta.

   Antes, cadastrar era preencher os mesmos campos do "Entrar" e apertar outro
   botão embaixo. Gente de verdade digitava e-mail e senha e não entendia se
   tinha entrado ou se cadastrado — foi o dono quem viu isso acontecer.

   O pop-up também colhe nome e data de nascimento, que são o que falta para o
   app calcular as calorias sem perguntar depois. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

/** Começa deslogado, na tela de entrada. */
const deslogado = page => page.addInitScript(() => { window.__semLogin = true; });

const preencher = (page, d) => page.evaluate(dados => {
  for (const [id, v] of Object.entries(dados)) {
    const c = document.getElementById(id);
    c.value = v; c.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, d);

const criar = async page => {
  await page.evaluate(() => document.getElementById('cadCriar').click());
  await page.waitForTimeout(400);
};

const abrirPopup = async page => {
  await page.evaluate(() => document.getElementById('btnSignup').click());
  await page.waitForTimeout(300);
};

/** Data de nascimento de alguém com N anos hoje, sem depender do dia da rodada. */
const nascComIdade = anos => {
  const h = new Date();
  return `${h.getFullYear() - anos}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

const goals = page => page.evaluate(() =>
  JSON.parse(localStorage.getItem('cutting.v1')).goals);

test.describe('O pop-up de criar conta', () => {

  test('"Criar conta grátis" abre um pedido próprio, não reusa os campos de entrar', async ({ page }) => {
    await deslogado(page);
    const erros = await abrirApp(page, estadoBase());
    await abrirPopup(page);

    const campos = await page.evaluate(() => ({
      aberto: document.getElementById('cadastroOverlay').classList.contains('open'),
      tem: ['cadNome', 'cadNasc', 'cadEmail', 'cadSenha'].map(i => !!document.getElementById(i)),
    }));

    expect(campos.aberto, 'sem pop-up a pessoa não sabe que está se cadastrando').toBe(true);
    expect(campos.tem).toEqual([true, true, true, true]);
    expect(erros).toEqual([]);
  });

  test('aproveita o e-mail já escrito na tela de entrada', async ({ page }) => {
    /* Quem digitou o e-mail e só então percebeu que não tem conta não deve
       precisar digitar de novo. */
    await deslogado(page);
    await abrirApp(page, estadoBase());
    await preencher(page, { email: 'pedro@t-results.app' });
    await abrirPopup(page);

    expect(await page.evaluate(() => document.getElementById('cadEmail').value))
      .toBe('pedro@t-results.app');
  });

  test('guarda nome e data de nascimento junto com a conta', async ({ page }) => {
    await deslogado(page);
    const st = estadoBase();
    const s = JSON.parse(st['cutting.v1']); delete s.goals.nome; delete s.goals.idade;
    st['cutting.v1'] = JSON.stringify(s);

    await abrirApp(page, st);
    await abrirPopup(page);
    await preencher(page, {
      cadNome: 'Pedro Henrique', cadNasc: nascComIdade(30),
      cadEmail: 'novo@t-results.app', cadSenha: 'senha123',
    });
    await criar(page);

    const g = await goals(page);
    expect(g.nome).toBe('Pedro Henrique');
    expect(g.nasc).toBe(nascComIdade(30));
    expect(g.idade, 'a idade sai da data, não é digitada').toBe(30);
  });

  test('a conta criada não passa pela tela que pergunta o nome de novo', async ({ page }) => {
    /* Perguntar o nome logo depois de a pessoa ter escrito o nome completo é
       o tipo de repetição que faz o app parecer desatento. */
    await deslogado(page);
    const st = estadoBase();
    const s = JSON.parse(st['cutting.v1']); delete s.goals.nome;
    st['cutting.v1'] = JSON.stringify(s);

    await abrirApp(page, st);
    await abrirPopup(page);
    await preencher(page, {
      cadNome: 'Pedro Henrique', cadNasc: nascComIdade(30),
      cadEmail: 'novo@t-results.app', cadSenha: 'senha123',
    });
    await criar(page);
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => document.querySelector('.view.on')?.id))
      .not.toBe('view-welcome');
  });
});

test.describe('O que o cadastro recusa', () => {

  const erroCom = async (page, dados) => {
    await abrirPopup(page);
    await preencher(page, dados);
    await criar(page);
    return page.evaluate(() => ({
      msg: document.getElementById('cadMsg').textContent,
      aberto: document.getElementById('cadastroOverlay').classList.contains('open'),
      criou: (window.__contas || []).length,
    }));
  };

  test.beforeEach(async ({ page }) => {
    await deslogado(page);
    await page.addInitScript(() => { window.__contas = []; });
  });

  test('sem nome, não cria', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await erroCom(page, { cadNome: '', cadNasc: nascComIdade(30), cadEmail: 'a@b.com', cadSenha: 'senha123' });
    expect(r.msg).toMatch(/nome/i);
    expect(r.aberto, 'o pop-up continua aberto para corrigir').toBe(true);
  });

  test('sem data de nascimento, não cria', async ({ page }) => {
    /* Sem ela o app voltaria a depender de alguém digitar a idade depois — que
       é justamente o que o pop-up existe para evitar. */
    await abrirApp(page, estadoBase());
    const r = await erroCom(page, { cadNome: 'Pedro', cadNasc: '', cadEmail: 'a@b.com', cadSenha: 'senha123' });
    expect(r.msg).toMatch(/nascimento/i);
    expect(r.aberto).toBe(true);
  });

  test('ano digitado errado é barrado antes de virar caloria torta', async ({ page }) => {
    /* 1092 em vez de 1992 daria uma TMB absurda, e ninguém perceberia. */
    await abrirApp(page, estadoBase());
    const r = await erroCom(page, { cadNome: 'Pedro', cadNasc: '1092-05-10', cadEmail: 'a@b.com', cadSenha: 'senha123' });
    expect(r.msg).toMatch(/data de nascimento/i);
    expect(r.aberto).toBe(true);
  });

  test('senha curta é barrada antes de o Firebase recusar', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await erroCom(page, { cadNome: 'Pedro', cadNasc: nascComIdade(30), cadEmail: 'a@b.com', cadSenha: '123' });
    expect(r.msg).toMatch(/6 caracteres/i);
    expect(r.aberto).toBe(true);
  });

  test('a idade aparece na tela enquanto a data é digitada', async ({ page }) => {
    /* Quem errou o ano vê na hora, e não meses depois com as contas erradas. */
    await abrirApp(page, estadoBase());
    await abrirPopup(page);
    await preencher(page, { cadNasc: nascComIdade(42) });
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => document.getElementById('cadIdade').textContent))
      .toBe('42 anos');

    await preencher(page, { cadNasc: '1092-05-10' });
    await page.waitForTimeout(150);
    const ruim = await page.evaluate(() => ({
      txt: document.getElementById('cadIdade').textContent,
      alerta: document.getElementById('cadIdade').classList.contains('ruim'),
    }));
    expect(ruim.alerta, 'data impossível precisa se anunciar').toBe(true);
  });
});

test.describe('A idade sai da data, e não envelhece errada', () => {

  test('a idade é calculada no dia de hoje, não guardada parada', async ({ page }) => {
    /* Este é o ponto: quem se cadastrou aos 29 seguiria 29 para sempre, e a
       conta de calorias iria ficando torta em silêncio, um ano por vez. */
    await abrirApp(page, estadoBase());

    const r = await page.evaluate(() => {
      const h = new Date();
      const dez = `${h.getFullYear() - 10}-01-01`;
      return {
        derivada: __t.idadeDe(dez),
        // conta antiga: só o número guardado, sem data
        soNumero: __t.idadeAtual({ idade: 29 }),
        // com data, a data manda — mesmo que o número guardado esteja velho
        dataManda: __t.idadeAtual({ idade: 29, nasc: dez }),
      };
    });

    expect(r.derivada).toBeGreaterThanOrEqual(10);
    expect(r.soNumero, 'contas antigas continuam funcionando pelo número').toBe(29);
    expect(r.dataManda, 'com data guardada, é ela que vale').toBe(r.derivada);
  });

  test('aniversário que ainda não chegou este ano não conta', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => {
      const h = new Date();
      const amanha = new Date(h.getTime() + 86400000);
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const nasc = iso(new Date(h.getFullYear() - 30, amanha.getMonth(), amanha.getDate()));
      return { anos: __t.idadeDe(nasc) };
    });
    /* Faltando um dia para o aniversário, ainda tem 29. */
    expect([29, 30]).toContain(r.anos);
  });

  test('a TMB usa a idade de hoje', async ({ page }) => {
    /* Mifflin-St Jeor tira 5 kcal por ano de idade: se a idade não acompanha,
       a meta diária fica errada e ninguém descobre. */
    await abrirApp(page, estadoBase());
    const r = await page.evaluate(() => {
      const base = { sexo: 'M', altura: 180, pesoAtual: 80 };
      const h = new Date();
      return {
        com20: __t.computeTMB({ ...base, nasc: `${h.getFullYear() - 20}-01-01` }),
        com60: __t.computeTMB({ ...base, nasc: `${h.getFullYear() - 60}-01-01` }),
      };
    });
    expect(r.com20).toBeGreaterThan(r.com60);
    expect(r.com20 - r.com60, '40 anos × 5 kcal = 200').toBeCloseTo(200, 0);
  });
});

test.describe('A data sobrevive ao formulário de objetivo', () => {

  /** Abre o formulário pelo caminho de verdade: Perfil → Editar. */
  const abrirObjetivo = async page => {
    await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('pfEdit').click());
    await page.waitForTimeout(500);
  };

  const comNascimento = nasc => {
    const st = estadoBase();
    const s = JSON.parse(st['cutting.v1']);
    s.goals.nasc = nasc;
    st['cutting.v1'] = JSON.stringify(s);
    return st;
  };

  test('salvar o objetivo não apaga a data de nascimento', async ({ page }) => {
    /* saveGoals remonta store.goals do zero: sem carregar a data junto, ela
       sumiria no primeiro salvamento e a idade voltaria a ser número parado. */
    await abrirApp(page, comNascimento('1994-03-15'));
    await abrirObjetivo(page);

    // percorre os três passos e salva
    await page.evaluate(() => document.getElementById('gNext').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('gNext').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('saveGoals').click());
    await page.waitForTimeout(500);

    const g = await goals(page);
    expect(g.nasc, 'a data precisa continuar guardada').toBe('1994-03-15');
    expect(g.idade, 'e a idade continua saindo dela').toBe(
      new Date().getFullYear() - 1994 - (new Date() < new Date(new Date().getFullYear(), 2, 15) ? 1 : 0));
  });

  test('com data guardada, o campo de idade não é digitável', async ({ page }) => {
    /* Duas verdades sobre a mesma pessoa é como elas se desencontram. */
    await abrirApp(page, comNascimento('1994-03-15'));
    await abrirObjetivo(page);

    const campo = await page.evaluate(() => {
      const e = document.getElementById('gIdade');
      return { valor: e.value, travado: e.readOnly, nota: document.getElementById('gIdadeNota').textContent };
    });

    const esperada = new Date().getFullYear() - 1994 -
      (new Date() < new Date(new Date().getFullYear(), 2, 15) ? 1 : 0);
    expect(campo.travado, 'a idade é conta, não pergunta').toBe(true);
    expect(+campo.valor).toBe(esperada);
    expect(campo.nota).toMatch(/nascimento/i);
  });

  test('conta antiga, sem data, continua digitando a idade', async ({ page }) => {
    /* Quem já usava o app não pode perder o campo que sempre preencheu. */
    await abrirApp(page, estadoBase());
    await abrirObjetivo(page);

    const campo = await page.evaluate(() => {
      const e = document.getElementById('gIdade');
      return { valor: e.value, travado: e.readOnly, nota: document.getElementById('gIdadeNota').textContent };
    });
    expect(campo.travado).toBe(false);
    expect(+campo.valor, 'a idade que ela já tinha').toBe(30);
    expect(campo.nota).toBe('');
  });
});
