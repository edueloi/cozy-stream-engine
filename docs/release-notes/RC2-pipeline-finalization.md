# RC2 — Finalização Obrigatória do Pipeline de Prospecção

## Causa raiz

`runSmartFlow` atualizava `prospecting_results.smart_flow_metadata` e
`smart_flow_status`, mas nunca gravava em `prospecting_company_scores` —
tabela lida pelo `ProspectingResultsPanel` via `listScoresForSearch`.
O mapper `classifyPersistedScore` retorna "Em processamento" quando não
acha a linha. Resultado: 100% das empresas apareciam "Em processamento"
indefinidamente. A UI também não tinha auto-refresh.

## Correções

- `src/lib/jcs-data-engine/smart-flow/smart-flow.server.ts`
  - Helper `persistFinalScore()` faz upsert em `prospecting_company_scores`.
  - `runSmartFlow` envolvido em `try/finally` — sempre persiste, mesmo em
    erro, timeout, budget exhausted, provider off, saldo insuficiente.
  - Se a linha ficou órfã em `aguardando_pre_score`/`enriquecendo`, o
    `finally` marca `smart_flow_status = enriquecido`.
  - Rows rejeitadas no pré-score também recebem linha definitiva.
- `src/components/prospecting-results-panel.tsx`
  - Auto-refresh a cada 3s enquanto houver empresa em "Em processamento".
    Desliga quando o contador chega a zero.

## Nenhuma alteração em

Schema do banco, ICP, Produtos, Cadências, Leads, CRM, WhatsApp, Agenda,
Email, Providers, Feature Flags, Failover, Orchestrator, Pré-Score,
Enrichment.

## Testes

`bunx tsgo --noEmit` sem erros. Suites existentes de smart-flow (classifier,
metrics, gates, validate) continuam verdes.

## Critérios de aceite

- Nenhuma empresa permanece em "Em processamento".
- Todos os resultados são classificados (good/review/outside).
- Buckets atualizam sem F5.
- Score final persistido em `prospecting_company_scores`.
- Erros/timeouts não deixam linha órfã.
- Zero regressão em CRM/cadências/agenda/email/providers.

## Rollback

Reverter os dois arquivos alterados. Nenhuma migração.
