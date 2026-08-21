const { defineConfig, devices } = require('@playwright/test');
const { prepararCopia } = require('./tests/app');

/* Gera a cópia instrumentada do index.html antes de rodar a suíte.
   Roda aqui (e não num globalSetup separado) para que `npx playwright test`
   funcione sem nenhum passo manual. */
prepararCopia();

/* Ambientes que já trazem um Chromium instalado (containers, CI próprio) podem
   apontá-lo em CHROMIUM_PATH em vez de baixar outro:
   CHROMIUM_PATH=/opt/pw-browsers/chromium npm test */
const navegadorDoSistema = process.env.CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
  : {};

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    /* o app é usado no celular: iPhone é a referência */
    viewport: { width: 390, height: 844 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...navegadorDoSistema,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
});
