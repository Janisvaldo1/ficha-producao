# LOG — Ficha de Produção

Últimos 5 minutos de toda sessão. Três linhas, dois minutos.
Se ficar mais longo, está virando diário — cortar.

- **Fiz:** o que funcionou
- **Travei:** problema com nome — específico e pesquisável
- **Próximo:** micro-tarefa que dá para começar em 60 segundos

Entradas mais recentes no topo.

---

## 20/10 (ter)
**Fiz:** assinatura da rota de capacidade com os dois parâmetros opcionais
(`str | None = None`). Tabela-verdade das 4 combinações — decidi recusar quando
vêm os dois, pra defeito na tela aparecer cedo. Validação com
`raise HTTPException(400)`, antes do `get_db()`. Testada nos 3 casos.
**Travei:** escrevi `encomenda and simulacao_id is None` achando que o `is None`
valia pros dois. Python não distribui — cada variável precisa da sua comparação.
**Próximo:** o `if` que escolhe a origem. Encomenda monta um WITH, simulação
monta outro. Atenção: `simulacao_item` não tem coluna `nome`, vai precisar de
JOIN com `produtos`.

## 18/10 (dom)
**Fiz:** entendi por que o `?` funciona com Postgres — o `get_db()` devolve um
`_ConnectionWrapper` que traduz pra `%s` (padrão Adapter). Descobri dois venvs no
projeto: `backend/venv` (servidor, enxuto) e `venv/` (scripts, tem pandas+requests).
Documentei o segundo em `scripts/requirements.txt`.
**Travei:** nada técnico. Gastei 45min em arrumação não planejada.
**Próximo:** assinatura da rota de capacidade — aceitar `encomenda` OU
`simulacao_id`, e o que fazer quando não vem nenhum dos dois.

## 17/10 (sáb)
**Fiz:** terminei a refatoração da query de capacidade com CTE — origem separada
do cálculo. Conferido em dois níveis: query x query no Neon, rota x rota no /docs.
Consertei sozinho o JOIN errado (`molde.id` → `molde.produto_codigo`).
**Travei:** nada travado. Me perdi de arquivo uma vez (escrevi a rota de
capacidade dentro do `simulacoes.py`).
**Próximo:** decidir a assinatura da rota de capacidade.

## 16/10 (sex)
**Fiz:** achei onde parei sozinho (git log + TAREFAS). Separei no papel
origem × cálculo na query de capacidade. Aprendi `WITH` (dar nome a uma query e
usar como tabela).
**Travei:** montar a query com `WITH` — joguei tudo pra dentro dos parênteses,
não sobrou nada depois do `)`. CTE sozinho não roda.
**Próximo:** escrever o SELECT que vem depois do `)`.
