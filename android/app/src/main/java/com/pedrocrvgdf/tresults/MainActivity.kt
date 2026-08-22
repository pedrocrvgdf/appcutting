package com.pedrocrvgdf.tresults

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * A casca nativa do T-RESULTS.
 *
 * A interface continua sendo o `index.html` publicado no GitHub Pages — este app
 * não duplica nada dela. O que ele acrescenta é o que a web não alcança: um
 * temporizador de verdade, com contagem regressiva desenhada pelo sistema na
 * barra de notificação e alarme no canal de alarme, que sobrepõe a música.
 *
 * A página conversa com o lado nativo por `window.TResults` (ver PonteWeb).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView

    private val pedirNotificacao =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* opcional */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)

        Notificacoes.criarCanais(this)
        pedirPermissaoDeNotificacao()
        conferirTelaCheia()

        web = WebView(this).apply {
            // mesmo fundo do app: evita o branco piscando antes da página pintar
            setBackgroundColor(Color.parseColor("#F7F7F3"))

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true            // localStorage: onde vivem os treinos
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = false  // o alarme da tela precisa soar sozinho
                // deixa a página saber que está rodando dentro do app, e não no navegador
                userAgentString = "$userAgentString TResultsApp/${BuildConfig.VERSION_NAME}"
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                    val destino = req.url
                    // o app fica no app; qualquer outro endereço vai para o navegador
                    if (destino.host == Uri.parse(BuildConfig.ENDERECO).host) return false
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, destino))
                        true
                    } catch (e: Exception) {
                        false
                    }
                }
            }

            addJavascriptInterface(PonteWeb(this@MainActivity), "TResults")
        }

        setContentView(web)

        if (estado != null) web.restoreState(estado) else web.loadUrl(BuildConfig.ENDERECO)

        // Voltar navega dentro do app; só sai quando não há para onde voltar.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
    }

    override fun onSaveInstanceState(estado: Bundle) {
        super.onSaveInstanceState(estado)
        web.saveState(estado)
    }

    /**
     * Sem esta permissão não existe contagem na barra nem alarme.
     * O pedido é do sistema, com diálogo de verdade — diferente do navegador,
     * onde o aviso pode ser suprimido e a permissão fica presa em "default".
     */
    private fun pedirPermissaoDeNotificacao() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val concedida = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!concedida) pedirNotificacao.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /**
     * Sem esta permissão o alarme não abre sozinho por cima do TikTok — ele
     * chega como notificação e espera um toque.
     *
     * Até o Android 13 ela vinha concedida. No 14 deixou de vir, e não existe
     * diálogo de sistema para pedi-la: o único caminho é mandar a pessoa para a
     * tela de ajuste. Foi exatamente o que derrubou o primeiro teste em celular
     * de verdade, e sem este aviso não haveria como descobrir.
     */
    private fun conferirTelaCheia() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        val gerente = getSystemService(NotificationManager::class.java) ?: return
        if (gerente.canUseFullScreenIntent()) return

        AlertDialog.Builder(this)
            .setTitle("Falta uma autorização")
            .setMessage(
                "Para o alarme do descanso aparecer por cima do Instagram ou do " +
                    "TikTok, o Android precisa da sua autorização.\n\n" +
                    "Sem ela o alarme ainda toca e vibra, mas fica esperando na " +
                    "barra de notificação até você tocar nele."
            )
            .setPositiveButton("Autorizar") { _, _ ->
                try {
                    startActivity(
                        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                            .setData(Uri.parse("package:$packageName"))
                    )
                } catch (e: Exception) { /* fabricante sem essa tela */ }
            }
            .setNegativeButton("Agora não", null)
            .show()
    }
}
