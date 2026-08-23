package com.pedrocrvgdf.tresults

import android.app.Activity
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/**
 * A ponte entre o `index.html` e o Android.
 *
 * Exposta para a página como `window.TResults`. O app web testa se ela existe:
 * quando existe, usa o temporizador nativo; quando não existe (navegador comum),
 * segue com o Web Push, que continua funcionando como antes.
 *
 * Tudo aqui é chamado a partir de um fio de execução do WebView, não do fio
 * principal — por isso o que mexe em tela ou em áudio passa por `runOnUiThread`.
 */
class PonteWeb(private val act: Activity) {

    private var previa: MediaPlayer? = null

    /** A página usa isto para saber que está dentro do app. */
    @JavascriptInterface
    fun disponivel(): Boolean = true

    @JavascriptInterface
    fun versao(): String = BuildConfig.VERSION_NAME

    /* ---------------- Temporizador ---------------- */

    /**
     * Começa o descanso. A contagem aparece na barra de notificação e continua
     * correndo com o app fechado, porque quem conta é o sistema.
     */
    @JavascriptInterface
    fun iniciarDescanso(segundos: Int, exercicio: String?) {
        // `exercicio` chega do JavaScript e pode vir nulo: declarar como não-nulo
        // faria o Kotlin estourar na fronteira, longe de quem causou.
        if (segundos <= 0 || segundos > 60 * 60) return   // descanso acima de 1 h não é descanso
        Descanso.agendar(act, segundos, exercicio ?: "")
    }

    /** Descanso pulado ou treino encerrado. */
    @JavascriptInterface
    fun cancelarDescanso() {
        Descanso.cancelar(act)
    }

    /* ---------------- Som do alarme ---------------- */

    @JavascriptInterface
    fun somDoAlarme(): String = Ajustes.nomeDoSom(act)

    /**
     * Abre o seletor do sistema — onde já estão os alarmes do celular e
     * qualquer som que a pessoa tenha posto lá. Escrever nosso próprio seletor
     * daria menos opções e mais código.
     */
    @JavascriptInterface
    fun escolherSom() {
        act.runOnUiThread { (act as? MainActivity)?.abrirSeletorDeSom() }
    }

    /**
     * Prévia curta, para ouvir antes de decidir.
     *
     * Usa MediaPlayer, e não Ringtone, por um motivo só: precisa tocar no mesmo
     * volume do alarme de verdade. Prévia alta com alarme baixo — ou o contrário
     * — não serve para julgar nada, que é justamente para o que ela existe.
     */
    @JavascriptInterface
    fun testarSom() {
        act.runOnUiThread {
            try {
                pararPrevia()
                val uri = Ajustes.somDoAlarme(act) ?: return@runOnUiThread
                previa = MediaPlayer().apply {
                    setDataSource(act, uri)
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    val f = Ajustes.fatorDeVolume(act)
                    setVolume(f, f)
                    prepare()
                    start()
                }
                Handler(Looper.getMainLooper()).postDelayed({ pararPrevia() }, 4000)
            } catch (e: Exception) { /* som inacessível: nada a fazer, e nada quebra */ }
        }
    }

    private fun pararPrevia() {
        try { previa?.stop() } catch (e: Exception) { }
        try { previa?.release() } catch (e: Exception) { }
        previa = null
    }

    /* ---------------- Volume ---------------- */

    @JavascriptInterface
    fun volumeDoAlarme(): Int = Ajustes.volume(act)

    @JavascriptInterface
    fun definirVolume(v: Int) {
        Ajustes.definirVolume(act, v)
    }

    /* ---------------- Entrar com a digital ----------------

       As duas operações abaixo são assíncronas de verdade: elas abrem o prompt
       do sistema e só respondem quando a pessoa encosta o dedo. Por isso não
       devolvem valor — respondem chamando `window.__digital` de volta na
       página, com `{acao, ok, ...}`. */

    @JavascriptInterface
    fun digitalDisponivel(): Boolean = Biometria.disponivel(act)

    /** Existe senha guardada neste aparelho para a conta que está logada? */
    @JavascriptInterface
    fun atalhoAtivo(): Boolean = Credencial.existe(act)

    /**
     * Este e-mail é o do atalho guardado?
     *
     * A página pergunta em vez de pedir o e-mail salvo, de propósito: assim o
     * endereço de quem estava logado nunca é exibido para quem pegou o celular.
     */
    @JavascriptInterface
    fun atalhoConfere(email: String?): Boolean =
        Credencial.existe(act) && Credencial.confere(act, email)

    @JavascriptInterface
    fun guardarAtalho(email: String?, senha: String?) {
        act.runOnUiThread { (act as? MainActivity)?.guardarAtalho(email, senha) }
    }

    @JavascriptInterface
    fun entrarComDigital(email: String?) {
        act.runOnUiThread { (act as? MainActivity)?.entrarComDigital(email) }
    }

    @JavascriptInterface
    fun esquecerAtalho() {
        Credencial.esquecer(act)
    }
}
