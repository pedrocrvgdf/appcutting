/* Módulos do perfil: som do alarme e trava por digital.

   Os dois se comportam de formas diferentes dentro e fora do app Android, e é
   justamente aí que erram: oferecer no navegador uma coisa que só o app faz, ou
   deixar no app uma lista que não toca nada. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

/** A ponte do app Android, com o que o perfil consulta. */
const PONTE = op => {
  window.__nativo = [];
  window.TResults = {
    disponivel: () => true,
    versao: () => '1.2',
    iniciarDescanso: () => {},
    cancelarDescanso: () => {},
    somDoAlarme: () => op.som,
    escolherSom: () => window.__nativo.push({ chamada: 'escolherSom' }),
    testarSom: () => window.__nativo.push({ chamada: 'testarSom' }),
    volumeDoAlarme: () => window.__vol,
    definirVolume: v => { window.__vol = v; window.__nativo.push({ chamada: 'definirVolume', v }); },
    biometriaDisponivel: () => op.biometria,
    biometriaAtiva: () => window.__bioAtiva,
    definirBiometria: a => { window.__bioAtiva = a; window.__nativo.push({ chamada: 'definirBiometria', a }); },
  };
  window.__bioAtiva = op.ativa;
  window.__vol = op.vol === undefined ? 100 : op.vol;
};

const irAoPerfil = async page => {
  await page.evaluate(() => document.querySelector('#tabbar [data-tab="perfil"]').click());
  await page.waitForTimeout(300);
};

const visivel = (page, id) => page.evaluate(
  i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none'; }, id);

test.describe('Som do alarme — no navegador', () => {

  test('lista os sons disponíveis, com um marcado', async ({ page }) => {
    const erros = await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    const opcoes = await page.evaluate(() =>
      [...document.querySelectorAll('#pfSomLista [data-som]')].map(b => b.dataset.som));
    const nomes = await page.evaluate(() => Object.keys(__t.ALARM_SONS));

    expect(opcoes, 'a lista precisa cobrir todos os sons que o app sabe tocar').toEqual(nomes);
    expect(await page.evaluate(() => document.getElementById('pfSomVal').textContent)).toBe('Claro');
    expect(erros).toEqual([]);
  });

  test('escolher um som guarda a escolha no aparelho', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    await page.evaluate(() => document.querySelector('#pfSomLista [data-som="grave"]').click());
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => __t.somDoAlarme())).toBe('grave');
    expect(await page.evaluate(() => localStorage.getItem('tresults.som'))).toBe('grave');
    expect(await page.evaluate(() => document.getElementById('pfSomVal').textContent)).toBe('Grave');
    expect(await page.evaluate(() =>
      document.querySelector('#pfSomLista [data-som="grave"]').classList.contains('on'))).toBe(true);
  });

  test('a escolha sobrevive ao app ser fechado e reaberto', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);
    await page.evaluate(() => document.querySelector('#pfSomLista [data-som="sino"]').click());
    await page.waitForTimeout(300);

    await page.reload();
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfSomVal').textContent)).toBe('Sino');
  });

  test('o som escolhido é o que o alarme realmente toca', async ({ page }) => {
    /* Guardar a escolha e continuar tocando o mesmo som seria o defeito mais
       fácil de não perceber. Medimos os cruzamentos por zero do áudio
       renderizado: som agudo cruza mais vezes que som grave. */
    await abrirApp(page, estadoBase());

    const medir = async som => {
      await page.evaluate(s => localStorage.setItem('tresults.som', s), som);
      await page.reload();
      await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
      return (await page.evaluate(() => __t.renderAlarm())).cruzamentos;
    };

    const grave = await medir('grave');
    const agudo = await medir('agudo');

    expect(grave, 'o alarme precisa render áudio de verdade').toBeGreaterThan(0);
    expect(agudo, 'som agudo tem que cruzar zero mais vezes que som grave')
      .toBeGreaterThan(grave * 1.3);
  });

  test('o volume começa no máximo, como era antes de existir o controle', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfVol').value)).toBe('100');
    expect(await page.evaluate(() => document.getElementById('pfVolVal').textContent)).toBe('100%');
  });

  test('baixar o volume deixa o alarme mais baixo de verdade', async ({ page }) => {
    /* Guardar o número e continuar tocando no mesmo volume seria exatamente o
       defeito que a pessoa reclamaria depois, na academia. Medimos o pico do
       áudio renderizado. */
    await abrirApp(page, estadoBase());

    const picoCom = async v => {
      await page.evaluate(x => localStorage.setItem('tresults.volume', x), v);
      await page.reload();
      await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
      return (await page.evaluate(() => __t.renderAlarm())).pico;
    };

    const alto = await picoCom('100');
    const baixo = await picoCom('30');

    expect(alto, 'no máximo o alarme precisa continuar alto').toBeGreaterThan(0.5);
    expect(baixo, 'a 30% tem que sobrar bem menos som').toBeLessThan(alto * 0.6);
    expect(baixo, 'mas ainda tem que dar para ouvir').toBeGreaterThan(0.05);
  });

  test('o volume não desce a zero', async ({ page }) => {
    /* Alarme mudo não é alarme: é um botão de desligar disfarçado, e a pessoa
       perderia o descanso sem entender por quê. */
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfVol').min)).toBe('10');

    await page.evaluate(() => {
      localStorage.setItem('tresults.volume', '0');
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfVolVal').textContent)).toBe('10%');
  });

  test('a escolha de volume sobrevive ao app ser reaberto', async ({ page }) => {
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    await page.evaluate(() => {
      const s = document.getElementById('pfVol');
      s.value = '45';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForFunction(() => !!window.__t, null, { timeout: 15000 });
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfVolVal').textContent)).toBe('45%');
  });

  test('a trava por digital não aparece no navegador', async ({ page }) => {
    /* Ela é do aparelho. Mostrar um botão que não faz nada é pior que não ter. */
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);
    expect(await visivel(page, 'pfSegWrap')).toBe(false);
  });
});

test.describe('Som do alarme — dentro do app Android', () => {

  test('mostra o som do sistema e abre o seletor dele', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: true, ativa: false });
    const erros = await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfSomVal').textContent)).toBe('Cesium');

    await page.evaluate(() => document.getElementById('pfSom').click());
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => window.__nativo.map(c => c.chamada)))
      .toContain('escolherSom');
    expect(erros).toEqual([]);
  });

  test('não mostra a lista de acordes, que não tocaria nada', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: true, ativa: false });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await visivel(page, 'pfSomLista')).toBe(false);
    expect(await page.evaluate(() =>
      document.querySelectorAll('#pfSomLista [data-som]').length)).toBe(0);
  });

  test('testar o som usa o alarme do sistema, não o do navegador', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: false, ativa: false });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    await page.evaluate(() => document.getElementById('pfSomTeste').click());
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => window.__nativo.map(c => c.chamada))).toContain('testarSom');
  });

  test('o volume mostrado é o que o Android guardou', async ({ page }) => {
    /* No app quem toca é o serviço nativo, então quem manda no volume é ele.
       Ler do localStorage aqui mostraria um número que não vale. */
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: false, ativa: false, vol: 40 });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfVolVal').textContent)).toBe('40%');
    expect(await page.evaluate(() => document.getElementById('pfVol').value)).toBe('40');
  });

  test('mudar o volume chega ao Android', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: false, ativa: false, vol: 100 });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    await page.evaluate(() => {
      const s = document.getElementById('pfVol');
      s.value = '25';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    expect(await page.evaluate(() =>
      window.__nativo.filter(c => c.chamada === 'definirVolume').map(c => c.v))).toEqual([25]);
    expect(await page.evaluate(() => document.getElementById('pfVolVal').textContent)).toBe('25%');
  });

  test('o perfil se atualiza quando o seletor do sistema volta', async ({ page }) => {
    /* O seletor é outra tela: sem este aviso, o perfil seguiria mostrando o som
       antigo até a pessoa sair e voltar. */
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: false, ativa: false });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    await page.evaluate(() => {
      window.TResults.somDoAlarme = () => 'Argon';
      window.__somMudou();
    });
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => document.getElementById('pfSomVal').textContent)).toBe('Argon');
  });
});

test.describe('Trava por digital', () => {

  test('aparece quando o celular tem biometria', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: true, ativa: false });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await visivel(page, 'pfSegWrap')).toBe(true);
    expect(await page.evaluate(() => document.getElementById('pfBioVal').textContent)).toBe('Desligado');
  });

  test('some quando o celular não tem biometria cadastrada', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: false, ativa: false });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await visivel(page, 'pfSegWrap')).toBe(false);
  });

  test('ligar e desligar chega ao Android', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: true, ativa: false });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    await page.evaluate(() => document.getElementById('pfBio').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.getElementById('pfBioVal').textContent)).toBe('Ligado');

    await page.evaluate(() => document.getElementById('pfBio').click());
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.getElementById('pfBioVal').textContent)).toBe('Desligado');

    expect(await page.evaluate(() => window.__nativo.filter(c => c.chamada === 'definirBiometria').map(c => c.a)))
      .toEqual([true, false]);
  });

  test('já ligada, o perfil mostra ligada ao abrir', async ({ page }) => {
    await page.addInitScript(PONTE, { som: 'Cesium', biometria: true, ativa: true });
    await abrirApp(page, estadoBase());
    await irAoPerfil(page);

    expect(await page.evaluate(() => document.getElementById('pfBioVal').textContent)).toBe('Ligado');
  });
});
