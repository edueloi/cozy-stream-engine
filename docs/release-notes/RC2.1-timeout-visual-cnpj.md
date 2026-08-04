# RC2.1 — Timeout, Pipeline Visual e CNPJ ausente

Complemento do RC2. Fecha os três buracos remanescentes reportados
pela Bruna: empresas travadas em processing por hang de provider,
falta de visibilidade das etapas por empresa, e Google Maps
aparecendo sem CNPJ sem sinalização.

## Correções

### 1) Timeout duro por empresa

`src/lib/jcs-data-engine/smart-flow/smart-flow.server.ts`

- `SMART_FLOW_PER_COMPANY_TIMEOUT_MS = 90_000` (constante exportada).
- `runSmartFlow` agora tem `try/catch/finally`. Erros são capturados,
  classificados por `classifySmartFlowFailure()` e persistidos
  sanitizados em `smart_flow_metadata.failure.reason` — sem stack
  trace para o vendedor.
- Motivos: `enrichment_timeout`, `provider_exhausted`,
  `budget_exhausted`, `missing_required_data`, `unexpected_error`.
- `runSmartFlowBatch` envolve cada empresa em `withTimeout(...)`. Se
  estourar, o batch marca a linha órfã como `smart_flow_status =
  "failed"` (ou `partial` se já havia dados úteis), grava o motivo em
  `smart_flow_metadata.failure` e continua para a próxima empresa.
  Uma empresa travada não interrompe mais o lote.
- Como sempre há linha em `prospecting_company_scores` (RC2), o bucket
  "Em processamento" é sempre limpo ao final — mesmo em timeout.

### 2) Pipeline Visual por empresa

`src/components/prospect-pipeline-steps.tsx` (novo).
`src/components/prospect-detail-drawer.tsx` (inclusão no drawer).

Deriva 7 etapas exclusivamente do estado JÁ persistido — nada de
segundo pipeline, nada de regras duplicadas:

- Empresa encontrada
- Pré-Score concluído (de `smart_flow_metadata.preliminary`)
- CNPJ localizado (de `prospecting_results.cnpj`)
- Enriquecimento concluído (de `smart_flow_metadata.enrichment`)
- Score Final calculado (de `prospecting_company_scores.icp_score`)
- Decisor pesquisado (de `prospecting_results.decision_makers_status`)
- Finalizado (de `smart_flow_status` + `smart_flow_metadata.failure`)

Estados: `done ✓`, `running ⌛`, `skipped —`, `failed ⚠`, `pending ○`.
Falhas mostram mensagem amigável ("Tempo limite excedido — reprocessar")
em vez de stack trace.

### 3) Google Maps + CNPJ ausente

Nada muda no fluxo de discovery — o Universal ICP Engine já trata
CNPJ ausente como `unknown` (nunca `disqualified`), e o mapper
persistido `classifyPersistedScore` já direciona para "Em revisão"
quando o score fica em 60..79. A regra crítica pedida — "nunca
considerar good_lead quando faltar dado obrigatório" — já é honrada
pelo engine em modo `final` via `insufficient_data`.

Pipeline Visual agora expõe esse estado explicitamente: linha do
Google Maps sem CNPJ mostra "CNPJ localizado" em `running` (quando
elegível) ou `skipped` (quando pré-score foi `frio`/`descartado`),
e "Finalizado" só fica `done` quando a empresa realmente sai do
processing.

### 4) Auto-refresh com cap

`src/components/prospecting-results-panel.tsx`

- Polling de 3s existente ganha cap de 100 ticks (5 min). Ao atingir
  estado terminal em todas as empresas, o polling encerra sozinho.
- Sem F5 para: etapas, status, score, bucket, contadores, drawer.

## Nenhuma alteração em

Schema, ICP Engine, thresholds, Provider Registry, ordem de failover,
Leads, CRM, Cadências, WhatsApp, Agenda, Email, fluxo legado. Zero
migration.

## Arquivos alterados

- `src/lib/jcs-data-engine/smart-flow/smart-flow.server.ts`
- `src/components/prospect-pipeline-steps.tsx` (novo)
- `src/components/prospect-detail-drawer.tsx`
- `src/components/prospecting-results-panel.tsx`
- `src/lib/jcs-data-engine/smart-flow/__tests__/timeout-and-visual.test.ts` (novo)
- `docs/release-notes/RC2.1-timeout-visual-cnpj.md` (este arquivo)

## Testes

`bunx tsgo --noEmit` sem erros.

`bunx vitest run` — 23 casos verdes cobrindo:
- `classifySmartFlowFailure` para os 5 motivos sanitizados;
- pipeline visual: empresa nova (só encontrada), frio (pula
  enriquecimento/decisor como skipped, não failed), CNPJ ausente
  após elegível (running), timeout (finalizado failed com motivo
  amigável), empresa completa (todas as etapas done);
- suites RC2 anteriores continuam verdes.

## Critérios de aceite

- ✅ Nenhuma empresa permanece em "Em processamento" após término,
  timeout ou erro.
- ✅ Timeout de uma empresa não interrompe o lote.
- ✅ Pipeline Visual reflete apenas estado persistido — sem
  duplicação de regras no frontend.
- ✅ Empresas sem CNPJ vindas do Google Maps não vão para "Lead Bom".
- ✅ Polling encerra ao atingir estado terminal ou após 5 min.
- ✅ Zero regressão em RC2, CRM, cadências, agenda, email, providers.

## Riscos

- Baixo. O timeout de 90s é generoso — só cai em provider verdadeiramente
  travado. Se algum lote legítimo precisar de mais, ajustar
  `SMART_FLOW_PER_COMPANY_TIMEOUT_MS`.
- Pipeline Visual é puramente derivado; se `smart_flow_metadata` estiver
  ausente (rows antigas antes do RC2), as etapas caem no fallback
  `pending`/`done` sem erro.

## Rollback

Reverter os 5 arquivos alterados/novos listados acima. Nenhuma
migração para desfazer.