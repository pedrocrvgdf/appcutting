package com.pedrocrvgdf.tresults

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity

/**
 * A trava por digital.
 *
 * O app guarda peso, medidas e alimentação. Quem pega o celular emprestado não
 * precisa ver nada disso.
 *
 * **O que ela é e o que não é:** ela protege a *abertura do app*, não a conta.
 * A sessão do Firebase continua sendo o que guarda o acesso aos dados na nuvem;
 * isto aqui evita que alguém com o celular na mão abra e leia.
 */
object Biometria {

    /* PIN e padrão entram junto com a digital de propósito: digital que falha
       sem alternativa tranca a pessoa fora do próprio app. Abaixo do Android 11
       essa combinação não é aceita, e aí fica só a biometria. */
    private val tipos: Int
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            BIOMETRIC_WEAK or DEVICE_CREDENTIAL
        } else {
            BIOMETRIC_WEAK
        }

    fun disponivel(ctx: Context): Boolean = try {
        BiometricManager.from(ctx).canAuthenticate(tipos) == BiometricManager.BIOMETRIC_SUCCESS
    } catch (e: Exception) {
        false
    }

    fun pedir(act: FragmentActivity, aoLiberar: () -> Unit, aoFalhar: () -> Unit) {
        val prompt = BiometricPrompt(
            act,
            ContextCompatExecutor(act),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(r: BiometricPrompt.AuthenticationResult) = aoLiberar()
                override fun onAuthenticationError(codigo: Int, msg: CharSequence) = aoFalhar()
            }
        )

        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("T-RESULTS")
            .setSubtitle("Confirme que é você para abrir")
            .setAllowedAuthenticators(tipos)
            .apply {
                // sem PIN como alternativa, o diálogo exige um botão de saída
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) setNegativeButtonText("Cancelar")
            }
            .build()

        try { prompt.authenticate(info) } catch (e: Exception) { aoFalhar() }
    }
}

/** Executor no fio principal, sem trazer dependência só para isto. */
private class ContextCompatExecutor(private val act: FragmentActivity) : java.util.concurrent.Executor {
    override fun execute(comando: Runnable) { act.runOnUiThread(comando) }
}
