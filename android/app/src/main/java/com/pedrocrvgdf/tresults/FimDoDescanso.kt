package com.pedrocrvgdf.tresults

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/**
 * Chega aqui quando o tempo acaba — mesmo com o app fechado, mesmo com o
 * celular em economia de bateria, porque quem chama é o AlarmManager.
 */
class FimDoDescanso : BroadcastReceiver() {

    companion object {
        const val EXERCICIO = "exercicio"
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        // a contagem cumpriu seu papel; deixá-la na barra viraria lixo parado em 00:00
        NotificationManagerCompat.from(ctx).cancel(Descanso.ID_CONTAGEM)
        Notificacoes.alarme(ctx, intent.getStringExtra(EXERCICIO) ?: "")
    }
}
