package com.pedrocrvgdf.tresults

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
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
 * temporizador de verdade, o som do alarme escolhido no sistema e a trava por
 * digital.
 *
 * A página conversa com o lado nativo por `window.TResults` (ver PonteWeb).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var cortina: TextView

    /** Quando saímos de vista. Serve para decidir se a trava volta a pedir. */
    private var saiuEm = 0L
    /** Ligado enquanto outra tela nossa está aberta (o seletor de som). */
    private var emOutraTela = false
    private var liberado = false

    private val pedirNotificacao =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* opcional */ }

    private val seletorDeSom =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            emOutraTela = false
            if (r.resultCode != RESULT_OK) return@registerForActivityResult
            val escolhido: Uri? = r.data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
            Ajustes.definirSom(this, escolhido)
            // o perfil precisa parar de mostrar o som antigo
            web.evaluateJavascript("window.__somMudou&&window.__somMudou()", null)
        }

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

        /* A cortina cobre a página enquanto a digital não é confirmada. Cobrir é
           melhor do que esperar para carregar: o app já vai abrindo por trás, e
           quando a pessoa confirma a tela está pronta. */
        cortina = TextView(this).apply {
            text = "T-RESULTS"
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            textSize = 22f
            setBackgroundColor(Color.parseColor("#0E7C6B"))
            isClickable = true      // engole toques que passariam para a página
            visibility = ViewGroup.INVISIBLE
        }

        setContentView(FrameLayout(this).apply {
            addView(web, FrameLayout.LayoutParams(-1, -1))
            addView(cortina, FrameLayout.LayoutParams(-1, -1))
        })

        if (estado != null) web.restoreState(estado) else web.loadUrl(BuildConfig.ENDERECO)

        // Voltar navega dentro do app; só sai quando não há para onde voltar.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (Ajustes.biometriaAtiva(this)) travar()
    }

    override fun onStart() {
        super.onStart()
        if (!Ajustes.biometriaAtiva(this) || emOutraTela) return
        // volta a pedir depois de um tempo fora; entre uma série e outra, não
        if (!liberado || System.currentTimeMillis() - saiuEm > 2 * 60_000) travar()
    }

    override fun onStop() {
        super.onStop()
        saiuEm = System.currentTimeMillis()
    }

    override fun onSaveInstanceState(estado: Bundle) {
        super.onSaveInstanceState(estado)
        web.saveState(estado)
    }

    /** Chamado pela página, por `window.TResults.escolherSom()`. */
    fun abrirSeletorDeSom() {
        emOutraTela = true
        val pedido = Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM)
            putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Som do alarme de descanso")
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Ajustes.somDoAlarme(this@MainActivity))
        }
        try {
            seletorDeSom.launch(pedido)
        } catch (e: Exception) {
            emOutraTela = false
        }
    }

    /* ---------------- Trava por digital ---------------- */

    private fun travar() {
        liberado = false
        cortina.visibility = ViewGroup.VISIBLE
        Biometria.pedir(this, aoLiberar = {
            liberado = true
            cortina.visibility = ViewGroup.INVISIBLE
        }, aoFalhar = {
            naoConfirmou()
        })
    }

    /**
     * Não confirmou. A saída é fechar o app, e não destravar — senão a trava
     * não trava nada. Tentar de novo fica a um toque de distância.
     */
    private fun naoConfirmou() {
        AlertDialog.Builder(this)
            .setTitle("Não foi possível confirmar")
            .setMessage("Confirme sua identidade para abrir o T-RESULTS.")
            .setCancelable(false)
            .setPositiveButton("Tentar de novo") { _, _ -> travar() }
            .setNegativeButton("Fechar") { _, _ -> finish() }
            .show()
    }

    /* ---------------- Permissões ---------------- */

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
