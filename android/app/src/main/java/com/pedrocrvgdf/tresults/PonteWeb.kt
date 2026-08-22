package com.pedrocrvgdf.tresults

import android.app.Activity
import android.webkit.JavascriptInterface

/**
 * A ponte entre o `index.html` e o Android.
 *
 * Exposta para a página como `window.TResults`. O app web testa se ela existe:
 * quando existe, usa o temporizador nativo; quando não existe (navegador comum),
 * segue com o Web Push, que continua funcionando como antes.
 *
 * Tudo aqui é chamado a partir de um fio de execução do WebView, não do fio
 * principal — por isso nada aqui toca em interface.
 */
class PonteWeb(private val act: Activity) {

    /** A página usa isto para saber que está dentro do app. */
    @JavascriptInterface
    fun disponivel(): Boolean = true

    @JavascriptInterface
    fun versao(): String = BuildConfig.VERSION_NAME

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
}
