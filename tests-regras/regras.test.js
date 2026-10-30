/* As regras do Firestore (../firestore.rules), no emulador.

   O que estas regras protegem é dado de outra pessoa: o treino, as cargas e,
   com permissão, o peso do aluno. Cada teste é uma tentativa que precisa
   falhar (ou passar) do jeito que a regra promete. Rodar:

     cd tests-regras && npm install && npm test

   (precisa de Java; o firebase-tools baixa o emulador na primeira vez) */

const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } = require('firebase/firestore');

let env;
const T1 = 'treinadorUm', T2 = 'treinadorDois', A1 = 'alunoUm', A2 = 'alunoDois', X = 'estranho';
const db = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
/* Prepara o cenário sem passar pelas regras. */
const semRegras = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));

const convite = (t, nome = 'Treinador') => ({ treinador: t, nome, criado: 1 });
const vinc = (aluno, t, codigo, extra = {}) => ({
  treinador: t, treinadorNome: 'Treinador', aluno, alunoNome: 'Aluno', codigo, desde: 1, pesos: false, ...extra,
});
const plano = t => ({ treinador: t, treinadorNome: 'Treinador', tprotos: [{ id: 'p1', nome: 'Hipertrofia' }], tprotocol: [], atualizado: 1 });
const diario = (extra = {}) => ({ aluno: A1, sessoes: [{ d: '2026-10-28', nome: 'Treino A', ex: [] }], atualizado: 1, ...extra });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tresults',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
after(() => env && env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  /* A1 é aluno de T1. A2 é aluno de T2, com o peso permitido. */
  await semRegras(async f => {
    await setDoc(doc(f, 'convites/ABC234'), convite(T1));
    await setDoc(doc(f, 'convites/XYZ789'), convite(T2));
    await setDoc(doc(f, `vinculos/${A1}`), vinc(A1, T1, 'ABC234'));
    await setDoc(doc(f, `vinculos/${A2}`), vinc(A2, T2, 'XYZ789', { pesos: true }));
    await setDoc(doc(f, `planos/${A1}`), plano(T1));
    await setDoc(doc(f, `diarios/${A1}`), diario());
    await setDoc(doc(f, `users/${A1}`), { goals: { nome: 'Aluno' } });
  });
});

/* ---- users/{uid}: o documento de cada conta ---- */

test('cada conta lê e grava só o próprio documento', async () => {
  await assertSucceeds(getDoc(doc(db(A1), `users/${A1}`)));
  await assertSucceeds(setDoc(doc(db(A1), `users/${A1}`), { goals: {} }));
  await assertFails(getDoc(doc(db(T1), `users/${A1}`)));   // nem o treinador dele
  await assertFails(setDoc(doc(db(T1), `users/${A1}`), { goals: {} }));
  await assertFails(getDoc(doc(anon(), `users/${A1}`)));
});

test('o que não está nas regras fica fechado', async () => {
  await assertFails(setDoc(doc(db(A1), 'outra/coisa'), { a: 1 }));
  await assertFails(getDoc(doc(db(A1), `users/${A1}/estado/alarme`)));
});

/* ---- convites ---- */

test('o treinador cria o próprio convite; ninguém cria em nome de outro', async () => {
  await assertSucceeds(setDoc(doc(db(T1), 'convites/K7P3QX'), convite(T1)));
  await assertFails(setDoc(doc(db(T1), 'convites/K7P3QW'), convite(T2)));
  await assertFails(setDoc(doc(anon(), 'convites/K7P3QV'), convite(T1)));
});

test('o código tem 6 letras e números, sem os que se confundem', async () => {
  for (const ruim of ['K7P3Q', 'K7P3QXX', 'k7p3qx', 'K0P3QX', 'KOP3QX', 'K1P3QX', 'KIP3QX'])
    await assertFails(setDoc(doc(db(T1), `convites/${ruim}`), convite(T1)), ruim);
});

test('convite não aceita campo a mais nem nome enorme', async () => {
  await assertFails(setDoc(doc(db(T1), 'convites/K7P3QX'), { ...convite(T1), extra: 1 }));
  await assertFails(setDoc(doc(db(T1), 'convites/K7P3QX'), convite(T1, 'x'.repeat(81))));
});

test('quem tem o código lê o convite; ninguém lista nem muda o dos outros', async () => {
  await assertSucceeds(getDoc(doc(db(X), 'convites/ABC234')));
  await assertFails(getDoc(doc(anon(), 'convites/ABC234')));
  await assertFails(getDocs(collection(db(X), 'convites')));
  await assertFails(setDoc(doc(db(T2), 'convites/ABC234'), convite(T2)));   // tomar o código de outro
  await assertFails(deleteDoc(doc(db(T2), 'convites/ABC234')));
  await assertSucceeds(deleteDoc(doc(db(T1), 'convites/ABC234')));
});

/* ---- vínculos ---- */

test('o aluno se liga com um convite de verdade daquele treinador', async () => {
  await assertSucceeds(setDoc(doc(db(X), `vinculos/${X}`), vinc(X, T1, 'ABC234')));
});

test('ninguém liga outra pessoa, nem com convite falso ou de outro treinador', async () => {
  await assertFails(setDoc(doc(db(T1), `vinculos/${X}`), vinc(X, T1, 'ABC234')));   // o treinador puxando alguém
  await assertFails(setDoc(doc(db(X), `vinculos/${X}`), vinc(X, T1, 'QQQ222')));    // código que não existe
  await assertFails(setDoc(doc(db(X), `vinculos/${X}`), vinc(X, T1, 'XYZ789')));    // código de T2 dizendo T1
  await assertFails(setDoc(doc(db(X), `vinculos/${X}`), vinc(A1, T1, 'ABC234')));   // campo aluno de outro
  await assertFails(setDoc(doc(db(X), `vinculos/${X}`), { ...vinc(X, T1, 'ABC234'), extra: 1 }));
  await assertFails(setDoc(doc(db(X), `vinculos/${X}`), vinc(X, T1, 'ABC234', { pesos: 'sim' })));
});

test('o treinador não se liga a si mesmo', async () => {
  await assertFails(setDoc(doc(db(T1), `vinculos/${T1}`), vinc(T1, T1, 'ABC234')));
});

test('o vínculo é lido pelo aluno e pelo treinador dele, e por mais ninguém', async () => {
  await assertSucceeds(getDoc(doc(db(A1), `vinculos/${A1}`)));
  await assertSucceeds(getDoc(doc(db(T1), `vinculos/${A1}`)));
  await assertFails(getDoc(doc(db(T2), `vinculos/${A1}`)));
  await assertFails(getDoc(doc(db(X), `vinculos/${A1}`)));
});

test('o treinador lista os próprios alunos, e só filtrando por ele', async () => {
  const meus = await assertSucceeds(getDocs(query(collection(db(T1), 'vinculos'), where('treinador', '==', T1))));
  if (meus.docs.map(d => d.id).join() !== A1) throw new Error('lista errada: ' + meus.docs.map(d => d.id));
  await assertFails(getDocs(collection(db(T1), 'vinculos')));
  await assertFails(getDocs(query(collection(db(T1), 'vinculos'), where('treinador', '==', T2))));
});

test('o aluno muda só a permissão do peso e o nome; o treinador não muda nada', async () => {
  await assertSucceeds(updateDoc(doc(db(A1), `vinculos/${A1}`), { pesos: true }));
  await assertSucceeds(updateDoc(doc(db(A1), `vinculos/${A1}`), { alunoNome: 'Ana' }));
  await assertFails(updateDoc(doc(db(A1), `vinculos/${A1}`), { treinador: T2 }));
  await assertFails(updateDoc(doc(db(A1), `vinculos/${A1}`), { desde: 5 }));
  await assertFails(updateDoc(doc(db(T1), `vinculos/${A1}`), { pesos: true }));   // o treinador ligando o peso
});

test('qualquer um dos dois desfaz a ligação; outro treinador, não', async () => {
  await assertFails(deleteDoc(doc(db(T2), `vinculos/${A1}`)));
  await assertFails(deleteDoc(doc(db(X), `vinculos/${A1}`)));
  await assertSucceeds(deleteDoc(doc(db(T1), `vinculos/${A1}`)));
  await assertSucceeds(deleteDoc(doc(db(A2), `vinculos/${A2}`)));
});

/* ---- planos: o treino que o treinador montou ---- */

test('só o treinador do aluno escreve o plano', async () => {
  await assertSucceeds(setDoc(doc(db(T1), `planos/${A1}`), plano(T1)));
  await assertFails(setDoc(doc(db(T2), `planos/${A1}`), plano(T2)));    // outro treinador
  await assertFails(setDoc(doc(db(A1), `planos/${A1}`), plano(T1)));    // o próprio aluno
  await assertFails(setDoc(doc(db(T1), `planos/${A1}`), plano(T2)));    // assinando por outro
  await assertFails(setDoc(doc(db(T1), `planos/${A2}`), plano(T1)));    // aluno de outro
  await assertFails(setDoc(doc(db(T1), `planos/${A1}`), { ...plano(T1), tprotocol: 'x' }));
});

test('o plano é lido pelo aluno e pelo treinador dele', async () => {
  await assertSucceeds(getDoc(doc(db(A1), `planos/${A1}`)));
  await assertSucceeds(getDoc(doc(db(T1), `planos/${A1}`)));
  await assertFails(getDoc(doc(db(T2), `planos/${A1}`)));
  await assertFails(getDoc(doc(db(A2), `planos/${A1}`)));
});

test('desfeita a ligação, o treinador perde o acesso; o aluno pode apagar o plano', async () => {
  await semRegras(f => deleteDoc(doc(f, `vinculos/${A1}`)));
  await assertFails(getDoc(doc(db(T1), `planos/${A1}`)));
  await assertFails(setDoc(doc(db(T1), `planos/${A1}`), plano(T1)));
  await assertSucceeds(deleteDoc(doc(db(A1), `planos/${A1}`)));
});

/* ---- diários: o que o aluno treinou ---- */

test('só o aluno escreve o próprio diário', async () => {
  await assertSucceeds(setDoc(doc(db(A1), `diarios/${A1}`), diario()));
  await assertFails(setDoc(doc(db(T1), `diarios/${A1}`), diario()));
  await assertFails(setDoc(doc(db(A2), `diarios/${A1}`), diario()));
  await assertFails(setDoc(doc(db(A1), `diarios/${A1}`), diario({ sessoes: 'x' })));
});

test('o diário é lido pelo aluno e pelo treinador dele, e por mais ninguém', async () => {
  await assertSucceeds(getDoc(doc(db(A1), `diarios/${A1}`)));
  await assertSucceeds(getDoc(doc(db(T1), `diarios/${A1}`)));
  await assertFails(getDoc(doc(db(T2), `diarios/${A1}`)));
  await assertFails(getDoc(doc(db(X), `diarios/${A1}`)));
  await semRegras(f => deleteDoc(doc(f, `vinculos/${A1}`)));
  await assertFails(getDoc(doc(db(T1), `diarios/${A1}`)), 'desfeita a ligação, o treinador não lê mais');
});

test('o peso corporal só entra no diário com a permissão no vínculo', async () => {
  const pesos = [{ d: '2026-10-28', w: 80 }];
  await assertFails(setDoc(doc(db(A1), `diarios/${A1}`), diario({ pesos })));   // A1 não permitiu
  await assertSucceeds(updateDoc(doc(db(A1), `vinculos/${A1}`), { pesos: true }));
  await assertSucceeds(setDoc(doc(db(A1), `diarios/${A1}`), diario({ pesos })));
  await assertFails(setDoc(doc(db(X), `diarios/${X}`), { aluno: X, sessoes: [], pesos }), 'sem vínculo, sem peso');
});

test('o aluno apaga o próprio diário; o treinador, não', async () => {
  await assertFails(deleteDoc(doc(db(T1), `diarios/${A1}`)));
  await assertSucceeds(deleteDoc(doc(db(A1), `diarios/${A1}`)));
});
