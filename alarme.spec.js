/* Alarme do descanso: precisa ser ouvido por cima da música da academia,
   sem virar alerta de desastre nem distorcer. */

const { test, expect } = require('@playwright/test');
const { abrirApp, estadoBase } = require('./app');

test.describe('Alarme do descanso', () => {

  test('o som sai alto o bastante e sem distorcer', async ({ page }) => {
    await abrirApp(page, estadoBase());

    // renderiza o alarme num contexto offline e mede o sinal
    const som = await page.evaluate(() => __t.renderAlarm());

    expect(som.pico, 'precisa ser alto para vencer a música').toBeGreaterThan(0.5);
    expect(som.pico, 'mas sem encostar no teto').toBeLessThanOrEqual(1);
    expect(som.estouradas, 'nenhuma amostra pode estourar — estouro vira chiado').toBe(0);
    expect(som.rms, 'energia sonora sustentada').toBeGreaterThan(0.02);
  });

  test('o volume é maior que o da versão que não se ouvia', async ({ page }) => {
    await abrirApp(page, estadoBase());
    const vol = await page.evaluate(() => __t.ALARM_VOL);
    expect(vol, 'era 0.35 e quase não se escutava com música').toBeGreaterThan(0.35);
  });

  test('existe um WAV de reserva para quando o WebAudio estiver suspenso', async ({ page }) => {
    await abrirApp(page, estadoBase());

    const wav = await page.evaluate(() => {
      const uri = __t.alarmWav();
      const bin = atob(uri.split(',')[1]);
      let pico = 0;
      for (let i = 44; i < bin.length - 1; i += 2) {
        let v = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8);
        if (v > 32767) v -= 65536;
        pico = Math.max(pico, Math.abs(v));
      }
      return { ehWav: uri.startsWith('data:audio/wav;base64,'), bytes: bin.length, pico };
    });

    expect(wav.ehWav).toBe(true);
    expect(wav.bytes, 'WAV com duração real, não um clique').toBeGreaterThan(40000);
    expect(wav.pico, 'o WAV precisa conter som audível').toBeGreaterThan(8000);
  });
});
