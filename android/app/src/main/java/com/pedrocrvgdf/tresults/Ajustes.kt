package com.pedrocrvgdf.tresults

import android.content.Context
import android.media.RingtoneManager
import android.net.Uri

/**
 * O que a pessoa escolheu, guardado no aparelho.
 *
 * De propósito não vai para o Firebase: o som é uma Uri de conteúdo deste
 * celular, que não significa nada em outro. Sincronizar isso deixaria o outro
 * aparelho apontando para um som que não existe lá.
 */
object Ajustes {

    private const val ARQUIVO = "tresults"
    private const val SOM = "som_alarme"
    private const val BIOMETRIA = "biometria"
    private const val VOLUME = "volume_alarme"

    /** Alarme mudo não é alarme; por isso o mínimo não é zero. */
    const val VOLUME_MINIMO = 10

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)

    /** O som escolhido, ou o alarme padrão do celular quando não há escolha. */
    fun somDoAlarme(ctx: Context): Uri? {
        val salvo = prefs(ctx).getString(SOM, null)
        if (salvo != null) return try { Uri.parse(salvo) } catch (e: Exception) { padrao() }
        return padrao()
    }

    private fun padrao(): Uri? =
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    fun definirSom(ctx: Context, uri: Uri?) {
        prefs(ctx).edit().apply {
            if (uri == null) remove(SOM) else putString(SOM, uri.toString())
        }.apply()
    }

    /** O nome que aparece no perfil. */
    fun nomeDoSom(ctx: Context): String {
        val uri = somDoAlarme(ctx) ?: return "Silencioso"
        return try {
            RingtoneManager.getRingtone(ctx, uri)?.getTitle(ctx) ?: "Padrão do celular"
        } catch (e: Exception) {
            "Padrão do celular"
        }
    }

    /**
     * De 10 a 100. É um multiplicador do volume de alarme do sistema, não uma
     * troca dele: mexer no volume do aparelho mudaria também o despertador da
     * pessoa, que não é da nossa conta.
     */
    fun volume(ctx: Context): Int =
        prefs(ctx).getInt(VOLUME, 100).coerceIn(VOLUME_MINIMO, 100)

    /** Fator para o MediaPlayer, de 0,1 a 1,0. */
    fun fatorDeVolume(ctx: Context): Float = volume(ctx) / 100f

    fun definirVolume(ctx: Context, v: Int) {
        prefs(ctx).edit().putInt(VOLUME, v.coerceIn(VOLUME_MINIMO, 100)).apply()
    }

    fun biometriaAtiva(ctx: Context): Boolean = prefs(ctx).getBoolean(BIOMETRIA, false)

    fun definirBiometria(ctx: Context, ativa: Boolean) {
        prefs(ctx).edit().putBoolean(BIOMETRIA, ativa).apply()
    }
}
