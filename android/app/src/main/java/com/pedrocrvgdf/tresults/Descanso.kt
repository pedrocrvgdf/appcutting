package com.pedrocrvgdf.tresults

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/**
 * O temporizador de descanso.
 *
 * Duas peças, e nenhuma delas depende do nosso código continuar rodando:
 *
 * 1. uma notificação com cronômetro decrescente — quem desenha a contagem é o
 *    sistema, então ela anda com o app fechado, na tela de bloqueio, no TikTok
 * 2. um alarme exato no AlarmManager — `setAlarmClock` é o único agendamento
 *    que o Android não adia por economia de bateria, justamente por ser o que
 *    os despertadores usam
 *
 * É essa combinação que a web não alcança: lá a contagem não existe e o
 * agendamento local foi removido do Chrome.
 */
object Descanso {

    const val ID_CONTAGEM = 1001
    const val ID_ALARME = 1002

    private const val PEDIDO_FIM = 20
    private const val PEDIDO_MOSTRAR = 21

    fun agendar(ctx: Context, segundos: Int, exercicio: String) {
        cancelar(ctx)

        val fim = System.currentTimeMillis() + segundos * 1000L

        Notificacoes.contagem(ctx, fim, exercicio)

        val gerente = ctx.getSystemService(AlarmManager::class.java)
        gerente.setAlarmClock(
            AlarmManager.AlarmClockInfo(fim, aberturaDoApp(ctx)),
            aoTerminar(ctx, exercicio)
        )
    }

    fun cancelar(ctx: Context) {
        ctx.getSystemService(AlarmManager::class.java).cancel(aoTerminar(ctx, ""))
        NotificationManagerCompat.from(ctx).cancel(ID_CONTAGEM)
    }

    /**
     * O que dispara quando o tempo acaba.
     *
     * FLAG_UPDATE_CURRENT com o mesmo código de pedido é o que faz `cancelar`
     * encontrar exatamente este agendamento — o Android compara os pedidos
     * ignorando os extras, então o texto do exercício não atrapalha.
     */
    private fun aoTerminar(ctx: Context, exercicio: String): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, PEDIDO_FIM,
            Intent(ctx, FimDoDescanso::class.java).putExtra(FimDoDescanso.EXERCICIO, exercicio),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    /** Para onde o sistema leva quem tocar no ícone de alarme do relógio. */
    private fun aberturaDoApp(ctx: Context): PendingIntent =
        PendingIntent.getActivity(
            ctx, PEDIDO_MOSTRAR,
            Intent(ctx, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
}
