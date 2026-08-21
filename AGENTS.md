# Instruções para agentes

As instruções deste projeto estão em **[CLAUDE.md](./CLAUDE.md)**.

Este arquivo existe para que agentes que procuram por `AGENTS.md` (Codex, Cursor,
OpenCode e outros) encontrem o mesmo conjunto de regras. Leia o `CLAUDE.md`
antes de qualquer alteração — ele é a fonte única.

Resumo do que está lá, para decidir se precisa ler tudo (precisa):

- App de arquivo único (`index.html`), **sem build**, publicado no GitHub Pages
- Para dar push, é preciso pedir `add_repo` com `access: "push"` antes;
  **nunca** oriente revogar a autorização do Claude no GitHub
- Toda alteração no `index.html` **exige** incrementar `const CACHE` no `sw.js`
- Proibido `alert()` / `confirm()` — use `appAlert()` e `appConfirm()`
- Rodar `npm test` (Playwright) antes de entregar; o CI roda a mesma suíte
  em todo pull request
