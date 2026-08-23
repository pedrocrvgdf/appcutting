package com.pedrocrvgdf.tresults

import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Quem realmente toca o alarme.
 *
 * A primeira versão deixava o som a cargo do canal de notificação, e no celular
 * de verdade não saiu som nenhum. O motivo: som de canal toca uma vez só, não
 * repete, e é silenciado quando o telefone está no modo vibrar. Aqui o som é
 * nosso:
 *
 * - `USAGE_ALARM` põe o áudio no stream de alarme, que o modo silencioso não
 *   corta — é o mesmo caminho do despertador do celular
 * - `AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE` pausa o TikTok em vez de tocar por
 *   cima dele
 * - `isLooping` repete até alguém dispensar, em vez de um toque que se perde
 *
 * Serviço em primeiro plano porque o alarme precisa continuar tocando com o app
 * fechado. Iniciá-lo a partir do receptor do alarme exato é permitido: é uma das
 * exceções da regra que impede serviços iniciados em segundo plano.
 */
class AlarmeService : Service() {

    companion object {
        const val PARAR = "com.pedrocrvgdf.tresults.PARAR"
        private const val DESISTIR_EM_MS = 60_000L
    }

    private val relogio = Handler(Looper.getMainLooper())
    private var tocador: MediaPlayer? = null
    private var vibrador: Vibrator? = null
    private var focoAtual: AudioFocusRequest? = null
    private val desistir = Runnable { pararTudo() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, id: Int): Int {
        if (intent?.action == PARAR) {
            pararTudo()
            return START_NOT_STICKY
        }

        val exercicio = intent?.getStringExtra(FimDoDescanso.EXERCICIO).orEmpty()
        startForeground(Descanso.ID_ALARME, Notificacoes.alarme(this, exercicio))

        tocar()
        vibrar()
        // alarme preso tocando para sempre é pior que alarme perdido
        relogio.postDelayed(desistir, DESISTIR_EM_MS)

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        relogio.removeCallbacks(desistir)
        silenciar()
    }

    private fun tocar() {
        val som = Ajustes.somDoAlarme(this) ?: return

        val atributos = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        pedirOFoco(atributos)

        tocador = try {
            MediaPlayer().apply {
                setDataSource(this@AlarmeService, som)
                setAudioAttributes(atributos)
                isLooping = true
                // multiplica o volume de alarme do sistema; não mexe nele
                val f = Ajustes.fatorDeVolume(this@AlarmeService)
                setVolume(f, f)
                prepare()
                start()
            }
        } catch (e: Exception) {
            null   // sem som ainda restam a vibração e a tela: nada de derrubar o alarme
        }
    }

    /** EXCLUSIVE pede que a música pare, não que abaixe. */
    private fun pedirOFoco(atributos: AudioAttributes) {
        val gerente = getSystemService(AudioManager::class.java) ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val pedido = AudioFocusRequest
                    .Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                    .setAudioAttributes(atributos)
                    .build()
                focoAtual = pedido
                gerente.requestAudioFocus(pedido)
            }
        } catch (e: Exception) { /* sem foco o alarme ainda toca, só não pausa a música */ }
    }

    private fun vibrar() {
        vibrador = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Vibrator::class.java)
        }
        val ciclo = longArrayOf(0, 500, 300, 500, 300, 700, 900)
        try {
            vibrador?.vibrate(VibrationEffect.createWaveform(ciclo, 0))  // 0 = repete do início
        } catch (e: Exception) { /* aparelho sem vibração */ }
    }

    private fun silenciar() {
        try { tocador?.stop() } catch (e: Exception) { }
        tocador?.release()
        tocador = null

        try { vibrador?.cancel() } catch (e: Exception) { }
        vibrador = null

        val gerente = getSystemService(AudioManager::class.java)
        val pedido = focoAtual
        if (gerente != null && pedido != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { gerente.abandonAudioFocusRequest(pedido) } catch (e: Exception) { }
        }
        focoAtual = null
    }

    private fun pararTudo() {
        silenciar()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
}
