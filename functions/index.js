/**
 * T-RESULTS — aviso de fim de descanso que chega com o app fechado.
 *
 * Por que isto existe: o navegador congela o app quando o usuário troca para
 * outro aplicativo, e não há API web para agendar uma notificação local
 * (o TimestampTrigger foi removido do Chrome). O único caminho que alcança
 * alguém que está no TikTok é uma notificação enviada de fora — daqui.
 *
 * Fluxo:
 *   1. o app chama `agendarAlarme` ao iniciar o descanso
 *   2. a tarefa fica na fila até o horário de término
 *   3. `dispararAlarme` envia a notificação por Web Push (padrão VAPID,
 *      funciona no Chrome, no Firefox e no Safari/iOS)
 *
 * Se o usuário pular o descanso, o app chama `cancelarAlarme`. A tarefa ainda
 * dispara, mas confere no Firestore se continua valendo e desiste em silêncio.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { defineSecret } = require("firebase-functions/params");
const { getFunctions } = require("firebase-admin/functions");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const webpush = require("web-push");

initializeApp();

/* As chaves VAPID identificam o remetente para o serviço de push.
   A pública o app busca em `chavePush`; a privada nunca sai daqui. */
const VAPID_PUBLICA = defineSecret("VAPID_PUBLICA");
const VAPID_PRIVADA = defineSecret("VAPID_PRIVADA");

const REGIAO = "southamerica-east1"; // São Paulo: menos latência para o Brasil
const FILA = "dispararAlarme";
const MAX_ESPERA_S = 60 * 60;        // descanso acima de 1 h não é descanso

/** Documento onde fica o alarme pendente de cada usuário. */
const docAlarme = (uid) => getFirestore().doc(`users/${uid}/estado/alarme`);

/* ------------------------------------------------------------------ *
 * 1. Chave pública — o app pede antes de se inscrever no push.
 *    Não é segredo: identifica o remetente, não autoriza nada.
 * ------------------------------------------------------------------ */
exports.chavePush = onCall(
  { region: REGIAO, secrets: [VAPID_PUBLICA] },
  () => ({ chave: VAPID_PUBLICA.value() })
);

/* ------------------------------------------------------------------ *
 * 2. Agendar — chamado quando o descanso começa.
 * ------------------------------------------------------------------ */
exports.agendarAlarme = onCall(
  { region: REGIAO },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para agendar o aviso.");

    const { sub, emSegundos, id, corpo } = req.data || {};
    if (!sub || !sub.endpoint) throw new HttpsError("invalid-argument", "Inscrição de push ausente.");
    if (!id) throw new HttpsError("invalid-argument", "Identificador do alarme ausente.");

    const espera = Number(emSegundos);
    if (!Number.isFinite(espera) || espera <= 0 || espera > MAX_ESPERA_S) {
      throw new HttpsError("invalid-argument", `Tempo fora do intervalo aceito (1 a ${MAX_ESPERA_S}s).`);
    }

    // marca qual alarme está valendo: o disparo confere isto antes de enviar
    await docAlarme(uid).set({ id, criadoEm: Date.now() });

    const fila = getFunctions().taskQueue(FILA, { region: REGIAO });
    await fila.enqueue(
      { uid, sub, id, corpo: String(corpo || "Hora da próxima série.") },
      { scheduleDelaySeconds: Math.round(espera) }
    );

    return { ok: true, id };
  }
);

/* ------------------------------------------------------------------ *
 * 3. Cancelar — descanso pulado ou treino encerrado.
 *    Não remove a tarefa: invalida o alarme, e o disparo desiste sozinho.
 *    Mais simples e mais seguro do que apagar tarefa por nome.
 * ------------------------------------------------------------------ */
exports.cancelarAlarme = onCall(
  { region: REGIAO },
  async (req) => {
    const uid = req.auth && req.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login.");
    await docAlarme(uid).set({ id: null, canceladoEm: Date.now() });
    return { ok: true };
  }
);

/* ------------------------------------------------------------------ *
 * 4. Disparar — a fila chama isto no horário do término.
 * ------------------------------------------------------------------ */
exports.dispararAlarme = onTaskDispatched(
  {
    region: REGIAO,
    secrets: [VAPID_PUBLICA, VAPID_PRIVADA],
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (req) => {
    const { uid, sub, id, corpo } = req.data || {};
    if (!uid || !sub || !id) return;

    // o descanso ainda está valendo? se foi pulado, sai calado
    const snap = await docAlarme(uid).get();
    if (!snap.exists || snap.data().id !== id) return;

    webpush.setVapidDetails(
      "mailto:inteligencia@cbv.med.br",
      VAPID_PUBLICA.value(),
      VAPID_PRIVADA.value()
    );

    const payload = JSON.stringify({
      titulo: "Descanso concluído",
      corpo,
      tag: "tresults-descanso",
    });

    try {
      await webpush.sendNotification(sub, payload, { TTL: 120, urgency: "high" });
    } catch (e) {
      /* 404 e 410 significam inscrição morta (app desinstalado, permissão
         revogada). Não adianta repetir: encerra sem erro. */
      const morto = e && (e.statusCode === 404 || e.statusCode === 410);
      if (!morto) throw e;
    }

    await docAlarme(uid).set({ id: null, enviadoEm: Date.now() });
  }
);
