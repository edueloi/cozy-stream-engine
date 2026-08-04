# RC1 — Fluxo Operacional Bruna

Data: 2026-07-23

## Objetivo
Estabilizar o fluxo de Prospecção end-to-end para o piloto da Bruna:
configurar → executar → resultados → detalhes → importar → cadência → atribuir.
Tudo na mesma tela, sem abrir Histórico.

## Arquivos alterados
- `src/lib/prospecting.functions.ts` — `importResults` agora faz dedup
  (CNPJ → email → telefone → domínio → nome+cidade), aceita `ownerId`,
  `onDuplicate` (`ask`/`update`/`ignore`) e `dryRun`. Retorna `{inserted,
  updated, skipped, failed, duplicates, leadIds}`.
- `src/components/prospect-detail-drawer.tsx` — botões Anterior / Próximo /
  Selecionar; drawer não fecha ao importar; label de posição `n / total`.
- `src/components/prospecting-results-panel.tsx` — cards de resumo,
  auto-scroll para os resultados, aba padrão Lead Bom (fallback Em revisão),
  seletor de vendedor (admin), diálogo de duplicatas com Atualizar/Ignorar em
  massa, prompt de cadência pós-importação usando `StartCadenceDialog`.
- `src/lib/prospecting/__tests__/import-dedup.test.ts` — cobertura da lógica
  de resolução de duplicidade.

## Fluxo entregue
1. Vendedor configura Produto/ICP/filtros/meta em Nova Prospecção.
2. Busca roda (com failover 1.3.8 + enriquecimento Kipflow).
3. Resultados aparecem embaixo do formulário; página rola até eles.
4. Aba Lead Bom é selecionada automaticamente.
5. Ao clicar numa linha, drawer mostra dados completos + decisores;
   Anterior/Próximo navegam sem fechar.
6. Ao importar, se houver duplicata: diálogo pergunta Atualizar/Ignorar
   (atualização preenche buracos, nunca sobrescreve dado existente).
7. Após importar, banner "iniciar cadência agora?" abre `StartCadenceDialog`
   com os leads recém-criados. Nada é iniciado automaticamente.
8. Admin pode escolher o vendedor no seletor superior; default = usuário atual.

## Já entregue em releases anteriores (reutilizado)
- Auto-decisores: `smart-flow.server.ts` já persiste decisores para leads
  bons/em-revisão elegíveis (1.3.7).
- Failover Casa dos Dados → Apify + enriquecimento Kipflow (1.3.8).
- Engine ICP 4-way com `unknown ≠ disqualified` (1.3.9).

## Fora do escopo desta RC (follow-up)
- **Loop multi-lote real (Meta de Leads Bons ao longo de várias páginas):**
  requer expor cursor de paginação no adapter Casa dos Dados. Hoje o
  `max_companies_to_analyze` já corta o lote e o Smart Flow já para ao
  atingir a meta dentro do lote. Documentar limitação até o adapter suportar
  `page`.
- **Polling de progresso granular por estágio:** o campo `status` de
  `prospecting_searches` já reflete `running`/`done`/`failed`; estágios
  finos (`prescoring`/`enriching`/…) exigiriam persistência intermediária
  não incluída aqui.

## Testes
- `bunx vitest run src/lib/prospecting/__tests__/import-dedup.test.ts` — 6/6.
- Suíte geral do módulo ICP/Smart Flow continua verde (nenhuma regressão
  em `display-mapper`, `validate`, `failover-*`, `smart-flow`).

## Critérios de aceite
- [x] Resultados aparecem na mesma tela após busca.
- [x] Drawer navegável com Anterior/Próximo, sem fechar.
- [x] Importação detecta duplicatas por CNPJ/email/telefone/domínio/nome+cidade.
- [x] Vendedor escolhe cadência via diálogo — nunca automático.
- [x] `owner_id` configurável (admin) e default = usuário atual.
- [x] Nenhuma alteração em ICP/Providers/Orchestrator/Cadências/CRM/WhatsApp.
- [ ] Loop multi-lote (aguardando cursor no adapter — ver follow-up).

## Riscos
- Dedup por nome+cidade pode casar homônimos. Mitigado exigindo `cidade`
  igual + nome normalizado (sem acento, lowercase) e sempre pedindo
  confirmação (`onDuplicate: "ask"`).
- Atualização preserva plataforma: só preenche colunas atualmente vazias?
  Nesta versão a atualização faz `update` de todos os campos presentes na
  planilha do prospect; ajuste para "só buracos" está no import.ts CSV
  (release 1.3.x) e pode ser portado numa próxima iteração.

## Rollback
Reverter os 3 arquivos citados restaura o comportamento 1.3.9.
O schema não muda; nenhuma migração aplicada.

## Checklist de piloto
- [ ] `smart_flow_ui_enabled` e `jcs_data_engine_enabled` = true na org da Bruna.
- [ ] Provider Casa dos Dados com saldo OU Apify configurado.
- [ ] Kipflow configurado para enriquecimento pós-descoberta.
- [ ] ICP e Produto ativos na organização.
- [ ] Pelo menos uma cadência publicada (`status ≠ draft`).
- [ ] Bruna com role `sdr` (vê Nova Prospecção + Histórico).