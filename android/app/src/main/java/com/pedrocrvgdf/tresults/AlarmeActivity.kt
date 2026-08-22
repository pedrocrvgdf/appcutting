package com.pedrocrvgdf.tresults

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * A tela que toma o celular quando o descanso acaba.
 *
 * Aparece por cima do que estiver aberto e sobre a tela de bloqueio — quando o
 * sistema deixa. Som e vibração são do AlarmeService, justamente para que o
 * alarme não dependa desta tela conseguir abrir.
 *
 * O que ela acrescenta é o reconhecimento de relance: na academia, com o celular
 * no silencioso, ver é mais confiável do que ouvir.
 */
class AlarmeActivity : AppCompatActivity() {

    private val relogio = Handler(Looper.getMainLooper())

    /** Insiste por um tempo e desiste sozinha: alarme preso é pior que alarme perdido. */
    private val desistir = Runnable { encerrar() }

    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        mostrarMesmoBloqueado()

        val exercicio = intent.getStringExtra(FimDoDescanso.EXERCICIO).orEmpty()
        setContentView(montarTela(exercicio))

        /* Som e vibração são do AlarmeService, não desta tela. Ela pode nem
           chegar a abrir — no Android 14+ a abertura automática depende de uma
           permissão que não vem concedida — e o alarme não pode depender disso. */
        relogio.postDelayed(desistir, 60_000)
    }

    override fun onNewIntent(novo: Intent) {
        super.onNewIntent(novo)
        setIntent(novo)
    }

    override fun onDestroy() {
        super.onDestroy()
        relogio.removeCallbacks(desistir)
    }

    private fun montarTela(exercicio: String): ViewGroup {
        val fundo = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0E7C6B"))
            setPadding(48, 48, 48, 48)
        }

        fundo.addView(texto("Descanso concluído", 30f, true))
        if (exercicio.isNotBlank()) fundo.addView(texto(exercicio, 20f, false))
        fundo.addView(texto("Hora da próxima série", 17f, false))

        val botao = Button(this).apply {
            text = "Pronto"
            textSize = 19f
            setTextColor(Color.parseColor("#0E7C6B"))
            setBackgroundColor(Color.WHITE)
            setPadding(0, 36, 0, 36)
            setOnClickListener { encerrar(abrirOApp = true) }
        }
        fundo.addView(botao, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = 56 })

        return fundo
    }

    private fun texto(conteudo: String, tamanho: Float, forte: Boolean) = TextView(this).apply {
        text = conteudo
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
        setTextSize(TypedValue.COMPLEX_UNIT_SP, tamanho)
        if (forte) setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, 12, 0, 12)
    }

    private fun mostrarMesmoBloqueado() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
    }

    private fun encerrar(abrirOApp: Boolean = false) {
        // quem está tocando é o serviço; fechar esta tela sem avisá-lo deixaria
        // o som preso no celular da pessoa
        startService(Intent(this, AlarmeService::class.java).setAction(AlarmeService.PARAR))
        if (abrirOApp) {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            )
        }
        finish()
    }
}
