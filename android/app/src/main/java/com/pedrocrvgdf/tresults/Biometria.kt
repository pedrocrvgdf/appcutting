package com.pedrocrvgdf.tresults

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity

/**
 * A digital, usada para entrar na conta.
 *
 * **O que ela é e o que não é:** ela não substitui a sessão do Firebase, que
 * continua sendo quem guarda o acesso aos dados na nuvem. Ela destrava a senha
 * guardada neste aparelho (ver `Credencial`) para o login acontecer sem
 * digitação.
 *
 * Aqui é `BIOMETRIC_STRONG` sozinho, sem PIN como alternativa, e isso é
 * deliberado: só a biometria de classe 3 pode destravar uma chave do Keystore, e
 * `CryptoObject` com credencial de aparelho só é aceito do Android 11 para
 * cima. Aceitar biometria fraca aqui daria um prompt que sempre falharia na hora
 * de decifrar. Quem não confirma continua com a senha, que nunca deixa de ser
 * uma saída — por isso o botão negativo se chama "Usar a senha".
 */
object Biometria {

    fun disponivel(ctx: Context): Boolean = try {
        BiometricManager.from(ctx).canAuthenticate(BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS
    } catch (e: Exception) {
        false
    }

    fun pedir(
        act: FragmentActivity,
        subtitulo: String,
        crypto: BiometricPrompt.CryptoObject,
        aoLiberar: (BiometricPrompt.AuthenticationResult) -> Unit,
        aoFalhar: () -> Unit
    ) {
        val prompt = BiometricPrompt(
            act,
            ExecutorNoFioPrincipal(act),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(r: BiometricPrompt.AuthenticationResult) =
                    aoLiberar(r)

                /* Só o erro encerra o prompt. `onAuthenticationFailed` é um dedo
                   que não bateu, e o prompt segue aberto para nova tentativa —
                   tratá-lo como falha fecharia o fluxo no primeiro deslize. */
                override fun onAuthenticationError(codigo: Int, msg: CharSequence) = aoFalhar()
            }
        )

        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("T-RESULTS")
            .setSubtitle(subtitulo)
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .setNegativeButtonText("Usar a senha")
            .setConfirmationRequired(false)
            .build()

        try { prompt.authenticate(info, crypto) } catch (e: Exception) { aoFalhar() }
    }
}

/** Executor no fio principal, sem trazer dependência só para isto. */
private class ExecutorNoFioPrincipal(private val act: FragmentActivity) :
    java.util.concurrent.Executor {
    override fun execute(comando: Runnable) { act.runOnUiThread(comando) }
}
