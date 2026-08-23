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
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject

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

    /** Ligado enquanto outra tela nossa está aberta (o seletor de som). */
    private var emOutraTela = false

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
        Ajustes.limparHeranca(this)
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

    /* ---------------- Entrar com a digital ----------------

       A digital não tranca a abertura do app: ela guarda e devolve a senha da
       conta, para o login acontecer sem digitação. Quem não confirma continua
       entrando pela senha — a saída nunca deixa de existir. */

    /** Cifra a senha sob a chave do Keystore, depois da digital confirmada. */
    fun guardarAtalho(email: String?, senha: String?) {
        val crypto = Credencial.prepararParaGuardar(this)
        if (crypto == null) { responder("guardar", false, motivo = "sem_chave"); return }

        Biometria.pedir(
            this,
            subtitulo = "Confirme para guardar sua entrada neste aparelho",
            crypto = crypto,
            aoLiberar = { r ->
                val ok = Credencial.guardar(this, r.cryptoObject?.cipher, email, senha)
                responder("guardar", ok, motivo = if (ok) "" else "falhou")
            },
            aoFalhar = { responder("guardar", false, motivo = "cancelado") }
        )
    }

    /** Devolve a senha para a página entrar, depois da digital confirmada. */
    fun entrarComDigital(email: String?) {
        if (!Credencial.confere(this, email)) {
            responder("entrar", false, motivo = "outra_conta"); return
        }
        val crypto = Credencial.prepararParaAbrir(this)
        /* `null` aqui é chave invalidada — digital nova cadastrada desde que a
           senha foi guardada. A credencial já foi descartada; a página precisa
           saber para voltar a pedir a senha em vez de insistir na digital. */
        if (crypto == null) { responder("entrar", false, motivo = "biometria_mudou"); return }

        Biometria.pedir(
            this,
            subtitulo = "Entre na sua conta T-RESULTS",
            crypto = crypto,
            aoLiberar = { r ->
                val senha = Credencial.abrir(this, r.cryptoObject?.cipher)
                if (senha == null) responder("entrar", false, motivo = "biometria_mudou")
                else responder("entrar", true, senha = senha)
            },
            aoFalhar = { responder("entrar", false, motivo = "cancelado") }
        )
    }

    /**
     * A resposta volta para a página por `window.__digital`.
     *
     * `JSONObject` e não interpolação de texto: a senha vira um literal
     * escapado, e uma aspas dentro dela deixa de ser capaz de quebrar o
     * JavaScript que estamos montando.
     */
    private fun responder(acao: String, ok: Boolean, senha: String = "", motivo: String = "") {
        val dados = JSONObject()
            .put("acao", acao).put("ok", ok)
            .put("senha", senha).put("motivo", motivo)
        val js = "window.__digital&&window.__digital($dados)"
        web.evaluateJavascript(js, null)
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
