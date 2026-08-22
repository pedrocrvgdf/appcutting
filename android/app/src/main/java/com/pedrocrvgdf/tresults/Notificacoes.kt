package com.pedrocrvgdf.tresults

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
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

        /* O som e a vibração NÃO ficam no canal — ficam no AlarmeService.
           Som de canal toca uma vez, não repete, e é cortado quando o telefone
           está no modo vibrar. Foi o que aconteceu no primeiro teste em celular
           de verdade: vibrou e não saiu som. Quem toca agora é o serviço, no
           stream de alarme, que o modo silencioso não silencia. */
        val alarme = NotificationChannel(
            CANAL_ALARME, "Fim do descanso", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Toca quando o descanso termina, mesmo com outro app aberto."
            setSound(null, null)
            enableVibration(false)
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

    /**
     * A notificação do alarme, devolvida para o AlarmeService usar como aviso do
     * serviço em primeiro plano.
     *
     * Ela tem três caminhos para chegar até a pessoa, de propósito:
     *
     * - `setFullScreenIntent` abre a tela por cima do TikTok — mas no Android 14+
     *   isso depende de uma permissão que não vem concedida (ver MainActivity)
     * - tocar na notificação abre a mesma tela, e esse caminho nunca é bloqueado
     * - o botão "Parar" silencia sem abrir nada
     *
     * O primeiro teste em celular real falhou justamente porque só o primeiro
     * caminho existia, e ele estava bloqueado.
     */
    fun alarme(ctx: Context, exercicio: String): android.app.Notification {
        val tela = PendingIntent.getActivity(
            ctx, 30,
            Intent(ctx, AlarmeActivity::class.java)
                .putExtra(FimDoDescanso.EXERCICIO, exercicio)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val parar = PendingIntent.getService(
            ctx, 32,
            Intent(ctx, AlarmeService::class.java).setAction(AlarmeService.PARAR),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(ctx, CANAL_ALARME)
            .setSmallIcon(R.drawable.ic_stat_tresults)
            .setContentTitle("Descanso concluído")
            .setContentText(if (exercicio.isBlank()) "Hora da próxima série." else "Hora da próxima série · $exercicio")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(tela)
            .setFullScreenIntent(tela, true)
            .addAction(0, "Parar", parar)
            .build()
    }

    private fun abrirOApp(ctx: Context): PendingIntent =
        PendingIntent.getActivity(
            ctx, 31,
            Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
}
