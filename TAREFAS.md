# Ficha de Produção → Ateliê

**Objetivo até 17/11:** responder, com número, se uma encomenda cabe no prazo
com os moldes que a fábrica tem hoje.

**Problema que isso resolve:** hoje a decisão de aceitar encomenda é discussão
verbal, sem dado. Quando falta molde, a produção fica desfalcada e ninguém
previu.

**Beneficiários:** dono da fábrica (decide) e equipe de produtores (usa).

---

## Regras deste projeto

1. Uma fatia por ciclo, atravessando banco → back-end → tela.
2. Nada entra no ciclo atual depois que ele começou. Ideia nova vai para o
   backlog ou para "Ideias".
3. Uma tarefa em andamento por vez.
4. Última sessão de cada ciclo é de consolidação: sem código novo.
5. Fim de ciclo = mostrar para o dono, mesmo feio.

---

## Ciclo 1 — até 20/09

**Fatia:** o produtor consegue cadastrar as informações de um molde e ver salvo.

- [ ] Rota `GET /api/moldes` — listar moldes
- [ ] Rota `PUT /api/moldes/{codigo}` — gravar unidades, peças por enchimento,
      enchimentos por dia
- [ ] Testar as duas no `/docs` antes de existir tela
- [ ] Formulário mínimo de cadastro
- [ ] Cadastrar 5 moldes reais e conferir no Neon
- [ ] Sessão de consolidação

---

## Ciclo 2 — até 04/10

**Fatia:** o admin vê na tela se uma encomenda cabe no prazo.

- [ ] Rota `GET /api/capacidade` com a query de capacidade
- [ ] Painel: total de itens, itens analisados, pior caso em dias, total de peças
- [ ] Aviso visível quando houver item sem molde cadastrado
- [ ] Aba "04 Capacidade" no front
- [ ] Sessão de consolidação

---

## Ciclo 3 — até 18/10

**Fatia:** inventário real dos moldes.

- [ ] Definir a fila de cadastro (120 produtos que já apareceram em encomenda)
- [ ] Acompanhar os produtores preenchendo
- [ ] Corrigir o que a realidade mostrar que o modelo não previu
- [ ] Rodar a capacidade de uma encomenda real com dado majoritariamente preenchido
- [ ] Sessão de consolidação

---

## Ciclo 4 — até 01/11

**Fatia:** custo do molde e ponto de equilíbrio.

- [ ] Campos de custo preenchidos pelo admin
- [ ] Cálculo: quantas peças o molde precisa produzir para se pagar
- [ ] Mostrar na tela junto com a capacidade
- [ ] Sessão de consolidação

---

## Ciclo 5 — até 17/11

**Fatia:** entrega acadêmica.

- [ ] Relatório de extensão
- [ ] Parte de Gestão da TI: viabilidade, custo, governança, indicador, riscos
- [ ] README do repositório com problema, arquitetura, decisões e prints
- [ ] Evidências: antes e depois, fala do dono e dos produtores

---

## Backlog (próximos ciclos)

- [ ] Relatório imprimível
- [ ] Registrar quem foi o último a alterar cada molde
- [ ] Migrar o ambiente local para apontar no Neon

---

## Ideias (não fazer ainda)

- [ ] Histórico de quebra de molde (tabela de unidades em vez de contador)
- [ ] Vida útil do molde: quantas peças aguenta
- [ ] Alerta automático para o setor de moldes quando faltar capacidade
- [ ] Script Python que consome a própria API e analisa no pandas
- [ ] Decidir o que fazer com a tabela `pecas` (era teste)

---

## Trilha de aprendizado

Marcar quando conseguir **explicar com as próprias palavras**, não quando só
tiver usado.

### SQL
- [x] SELECT, WHERE
- [x] INNER JOIN e LEFT JOIN — qual linha vem de onde
- [x] GROUP BY e agregação (SUM, COUNT, MAX)
- [x] COUNT(*) vs COUNT(coluna) — o que é nulo
- [x] Subquery
- [x] Granularidade: somar antes de calcular
- [ ] Window functions

### Banco
- [x] CREATE TABLE, INSERT
- [x] INSERT ... SELECT (carga em massa dentro do banco)
- [x] Chave estrangeira e UNIQUE
- [x] information_schema (metadado)
- [] Índice e desempenho
- [ ] Migração de schema com dado em produção

### Arquitetura
- [x] Três camadas: tela → back-end → banco
- [x] Camada de abstração de dados (o `database.py`)
- [x] Ambiente local vs produção
- [x] Escrever uma rota
- [ ] Como uma função Python vira JSON

### Python / dados
- [x] POO, ETL com classes
- [x] pandas: leitura, filtro, groupby
- [ ] Consumir API com `requests`
- [ ] Tratar erro e paginação
- [ ] Automação: script que roda sozinho

### Depois
- [ ] Docker
- [ ] Cloud (S3 ou GCP)
- [ ] Airflow

---

## Decisões tomadas

Uma linha por decisão, com o motivo. É isso que alimenta o README e o
relatório depois.

- **Evoluir a Ficha de Produção em vez de criar um sistema novo** — o sistema
  já está em uso, a adoção já existe.
- **Delegar o front, assumir back-end e banco** — o objetivo profissional é
  dados; front não aproxima disso.
- **Molde quebrado vira 0 unidades, sem histórico** — simplicidade, prazo curto.
  A tabela de unidades fica como ideia futura.
- **Um produto = um modelo de molde, quantidade em coluna** — a fábrica tem
  moldes iguais, não moldes diferentes para o mesmo produto.
- **Guardar o que é fato, calcular o que é consequência** — rendimento e
  unidades ficam no banco; capacidade por dia é calculada.
- **`unidades_disponiveis` começa em 0 e existe a coluna `cadastrado`** — o
  sistema precisa admitir o que não sabe em vez de dar número falso.
- **Cadastro inicial por planilha ou lote, não item a item na tela** — são 120
  moldes; a tela serve para corrigir, não para preencher do zero.
- **Não usar ferramenta de gestão de projeto** — o gargalo é tempo, não
  coordenação entre pessoas.

- **O modelo atual não comporta um produto que sai de moldes diferentes** —
  `produto_codigo` é UNIQUE, então é um produto para um molde. Se a realidade
  do inventário mostrar o contrário, entra a tabela `produto_molde` ligando as
  combinações. Não foi modelado antes porque a informação ainda não está clara.
- **Não modelar o que a fábrica ainda não confirmou** — a estrutura foi feita
  para aguentar expansão, não para adivinhar casos futuros.
  
  Cadastro inicial feito pelo /docs — o formulário só entra depois de validado o modelo com dado real