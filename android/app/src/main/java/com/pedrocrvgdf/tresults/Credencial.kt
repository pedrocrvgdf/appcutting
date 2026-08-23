package com.pedrocrvgdf.tresults

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricPrompt
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * O cofre da senha da conta.
 *
 * Para a digital substituir a senha no login, a senha precisa existir em algum
 * lugar do aparelho. Guardá-la em texto puro seria trocar uma conveniência por
 * um vazamento; aqui ela é cifrada com uma chave que **mora no Keystore do
 * Android** e só é liberada pelo hardware depois de uma digital confirmada.
 *
 * Três propriedades da chave importam, e nenhuma é decorativa:
 *
 * - `setUserAuthenticationRequired(true)` — sem digital, o próprio Keystore
 *   recusa a decifragem. Não é o nosso código que decide: é o hardware.
 * - autenticação **por uso**, e não por tempo — uma digital libera exatamente
 *   uma decifragem, e não uma janela de segundos em que qualquer chamada passa.
 * - `setInvalidatedByBiometricEnrollment(true)` — cadastrar uma digital nova
 *   destrói a chave. Quem acrescenta o próprio dedo ao celular de outra pessoa
 *   não herda o acesso; a credencial some e a senha volta a ser pedida.
 *
 * A chave nunca sai do Keystore, e a senha decifrada existe só durante a
 * chamada que entra na conta.
 */
object Credencial {

    private const val COFRE = "AndroidKeyStore"
    private const val APELIDO = "tresults_cred_v1"
    private const val TRANSFORMACAO = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128

    private const val ARQUIVO = "tresults"
    private const val IV = "cred_iv"
    private const val BLOB = "cred_blob"
    private const val EMAIL = "cred_email"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)

    /** O atalho está ligado quando existe credencial guardada — não há booleano
     *  separado justamente para os dois não poderem discordar. */
    fun existe(ctx: Context): Boolean =
        prefs(ctx).getString(BLOB, null) != null && prefs(ctx).getString(IV, null) != null

    /**
     * O e-mail é guardado como resumo, não em claro.
     *
     * Não é para esconder de perícia — o registro do Firebase tem o endereço em
     * claro no IndexedDB. É para a tela de entrada conseguir responder "esta
     * conta tem atalho neste aparelho?" sem **exibir** o e-mail de quem estava
     * logado para quem pegou o celular.
     */
    fun confere(ctx: Context, email: String?): Boolean {
        val salvo = prefs(ctx).getString(EMAIL, null) ?: return false
        return salvo == resumo(email)
    }

    private fun resumo(email: String?): String {
        val limpo = (email ?: "").trim().lowercase()
        val bytes = MessageDigest.getInstance("SHA-256").digest(limpo.toByteArray())
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    fun esquecer(ctx: Context) {
        prefs(ctx).edit().remove(IV).remove(BLOB).remove(EMAIL).apply()
        try {
            KeyStore.getInstance(COFRE).apply { load(null) }.deleteEntry(APELIDO)
        } catch (e: Exception) { /* já não existia */ }
    }

    /* ---------------- Guardar ---------------- */

    /**
     * Prepara a cifragem. Devolve o `CryptoObject` que o BiometricPrompt precisa
     * confirmar antes de a senha poder ser cifrada — ou `null` quando o aparelho
     * recusa a chave.
     *
     * Há ROM que anuncia biometria forte ao `BiometricManager` e mesmo assim
     * recusa a chave presa a uma autenticação por uso. Sem este `try`, ligar o
     * atalho derrubaria o app na cara de quem tocou o botão.
     */
    fun prepararParaGuardar(ctx: Context): BiometricPrompt.CryptoObject? = try {
        val cifra = Cipher.getInstance(TRANSFORMACAO)
        cifra.init(Cipher.ENCRYPT_MODE, criarChave())
        BiometricPrompt.CryptoObject(cifra)
    } catch (e: Exception) {
        esquecer(ctx)
        null
    }

    /** Chamado depois da digital confirmada, com a cifra que o prompt liberou. */
    fun guardar(ctx: Context, cifra: Cipher?, email: String?, senha: String?): Boolean {
        if (cifra == null || senha.isNullOrEmpty()) return false
        return try {
            val fechado = cifra.doFinal(senha.toByteArray(Charsets.UTF_8))
            prefs(ctx).edit()
                .putString(IV, Base64.encodeToString(cifra.iv, Base64.NO_WRAP))
                .putString(BLOB, Base64.encodeToString(fechado, Base64.NO_WRAP))
                .putString(EMAIL, resumo(email))
                .apply()
            true
        } catch (e: Exception) {
            esquecer(ctx)
            false
        }
    }

    /* ---------------- Abrir ---------------- */

    /**
     * Prepara a decifragem. `null` aqui quer dizer que a chave não serve mais —
     * digital nova cadastrada, credencial apagada, aparelho trocado — e a
     * credencial é descartada para o app voltar a pedir a senha.
     */
    fun prepararParaAbrir(ctx: Context): BiometricPrompt.CryptoObject? {
        val ivTexto = prefs(ctx).getString(IV, null) ?: return null
        return try {
            val cifra = Cipher.getInstance(TRANSFORMACAO)
            cifra.init(
                Cipher.DECRYPT_MODE,
                chaveExistente() ?: return null,
                GCMParameterSpec(TAG_BITS, Base64.decode(ivTexto, Base64.NO_WRAP))
            )
            BiometricPrompt.CryptoObject(cifra)
        } catch (e: Exception) {
            /* Firmware entrega a invalidação de formas diferentes — às vezes
               KeyPermanentlyInvalidatedException, às vezes KeyStoreException
               genérica. Todas terminam no mesmo lugar: credencial descartada. */
            esquecer(ctx)
            null
        }
    }

    /** Devolve a senha, ou `null` se a decifragem falhar. */
    fun abrir(ctx: Context, cifra: Cipher?): String? {
        if (cifra == null) return null
        val blob = prefs(ctx).getString(BLOB, null) ?: return null
        return try {
            String(cifra.doFinal(Base64.decode(blob, Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (e: Exception) {
            esquecer(ctx)
            null
        }
    }

    /* ---------------- A chave ---------------- */

    private fun chaveExistente(): SecretKey? = try {
        val ks = KeyStore.getInstance(COFRE).apply { load(null) }
        ks.getKey(APELIDO, null) as? SecretKey
    } catch (e: Exception) {
        null
    }

    private fun criarChave(): SecretKey {
        val gerador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, COFRE)
        val spec = KeyGenParameterSpec.Builder(
            APELIDO,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .apply {
                /* minSdk é 26, e a forma de pedir "uma digital por uso" mudou no
                   Android 11. Nos dois casos o sentido é o mesmo: a autorização
                   vale para esta operação, não por um tempo. */
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION")
                    setUserAuthenticationValidityDurationSeconds(-1)
                }
            }
            .build()
        gerador.init(spec)
        return gerador.generateKey()
    }
}
