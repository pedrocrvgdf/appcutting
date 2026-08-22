package com.pedrocrvgdf.tresults

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Os dois avisos do descanso, em canais separados de propósito.
 *
 * A contagem é discreta e some sozinha. O fim do descanso é alarme: som no
 * canal de alarme — que toca por cima da música, e não junto com ela — mais
 * vibração e tela cheia.
 */
object Notificacoes {

    const val CANAL_CONTAGEM = "descanso"
    const val CANAL_ALARME = "alarme"

    fun criarCanais(ctx: Context) {
        val gerente = ctx.getSystemService(NotificationManager::class.java)

        val contagem = NotificationChannel(
            CANAL_CONTAGEM, "Descanso em andamento", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "A contagem regressiva enquanto você descansa."
            setSound(null, null)          // a contagem não faz barulho: ela só mostra
            enableVibration(false)
            setShowBadge(false)
        }

        /* USAGE_ALARM é o ponto inteiro deste projeto: som de notificação
           disputa espaço com a música, som de alarme interrompe. É a diferença
           entre ouvir e não ouvir no meio da academia. */
        val atributos = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val som = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val alarme = NotificationChannel(
            CANAL_ALARME, "Fim do descanso", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Toca quando o descanso termina, mesmo com outro app aberto."
            setSound(som, atributos)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 150, 400, 150, 600)
            setBypassDnd(false)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
        }

        gerente.createNotificationChannels(listOf(contagem, alarme))
    }

    /**
     * A contagem regressiva.
     *
     * `setChronometerCountDown` é o que a web não tem: o sistema desenha o tempo
     * andando sozinho, sem o app precisar acordar a cada segundo.
     */
    @SuppressLint("MissingPermission")
    fun contagem(ctx: Context, fimEmMillis: Long, exercicio: String) {
        val aviso = NotificationCompat.Builder(ctx, CANAL_CONTAGEM)
            .setSmallIcon(R.drawable.ic_stat_tresults)
            .setContentTitle("Descanso")
            .setContentText(if (exercicio.isBlank()) "Próxima série a caminho" else exercicio)
            .setWhen(fimEmMillis)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(abrirOApp(ctx))
            .build()

        NotificationManagerCompat.from(ctx).notify(Descanso.ID_CONTAGEM, aviso)
    }

    /** O alarme: tela cheia por cima do que estiver aberto, som e vibração. */
    @SuppressLint("MissingPermission")
    fun alarme(ctx: Context, exercicio: String) {
        val tela = PendingIntent.getActivity(
            ctx, 30,
            Intent(ctx, AlarmeActivity::class.java)
                .putExtra(FimDoDescanso.EXERCICIO, exercicio)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val aviso = NotificationCompat.Builder(ctx, CANAL_ALARME)
            .setSmallIcon(R.drawable.ic_stat_tresults)
            .setContentTitle("Descanso concluído")
            .setContentText(if (exercicio.isBlank()) "Hora da próxima série." else "Hora da próxima série · $exercicio")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(tela)
            // `true` = pode interromper o que o usuário estiver fazendo. É o que
            // faz o alarme aparecer por cima do TikTok em vez de esperar na barra.
            .setFullScreenIntent(tela, true)
            .build()

        NotificationManagerCompat.from(ctx).notify(Descanso.ID_ALARME, aviso)
    }

    private fun abrirOApp(ctx: Context): PendingIntent =
        PendingIntent.getActivity(
            ctx, 31,
            Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
}
