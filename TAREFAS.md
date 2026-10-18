# Ficha de Produção → Ateliê

**Objetivo até 17/11:** responder, com número, se uma encomenda cabe no prazo
com os moldes que a fábrica tem hoje.

**Problema que isso resolve:** hoje a decisão de aceitar encomenda é discussão
verbal, sem dado. Quando falta molde, a produção fica desfalcada e ninguém
previu.

**Beneficiários:** dono da fábrica (decide) e equipe de produtores (usa).

**Status em 07/10:** o sistema responde a pergunta de ponta a ponta — banco,
rotas, tela, em produção. Mas responde sobre **10 de 70 itens**. O gargalo
agora não é técnico: é o inventário dos moldes.

---

## Regras deste projeto

1. Uma fatia por ciclo, atravessando banco → back-end → tela.
2. Nada entra no ciclo atual depois que ele começou. Ideia nova vai para o
   backlog ou para "Ideias".
3. Uma tarefa em andamento por vez.
4. Última sessão de cada ciclo é de consolidação: sem código novo.
5. Fim de ciclo = mostrar para o dono, mesmo feio.
6. Antes de um desafio novo, montar a quebra em etapas aqui — serve de mapa
   para reancorar quando perder o fio no meio da implementação.

---

## Ciclo 1 — concluído

**Fatia:** o produtor cadastra as informações de um molde e vê salvo.

- [x] Rota `GET /api/moldes` — listar com busca por nome ou código
- [x] Rota `PUT /api/moldes/{produto_codigo}` — gravar unidades, peças por
      enchimento, enchimentos por dia
- [x] Schema `AtualizarMoldeRequest`
- [x] Testadas no `/docs`
- [x] Tela 04 de cadastro
- [x] Cadastrar moldes reais e conferir no Neon

---

## Ciclo 2 — concluído

**Fatia:** o dono escolhe uma encomenda e vê se cabe no prazo.

- [x] Rota `GET /api/capacidade?encomenda=&prazo_dias=`
- [x] Rota `GET /api/encomendas` — lista com produtos e peças de cada uma
- [x] Tela 05: seletor de encomenda + campo de prazo (padrão 14)
- [x] Mostrar: cabe ou não cabe, pior caso em dias, total de peças
- [x] Mostrar: X de Y itens analisados, com aviso quando incompleto
- [x] Mostrar: lista dos itens sem molde cadastrado
- [x] Link das abas 04 e 05 no index.html
- [x] Script `relatorio_moldes.py` consumindo a própria API
- [x] Redesenho visual do CSS

**Pendência técnica que ficou:**

- [x] `cabe_no_prazo` devolve `true` quando `itens_analisados` é 0 — o pior
      caso fica em 0 e a comparação passa. Deveria devolver `null`.
      Correção: `None if itens_analisados == 0 else pior_caso <= prazo_dias`

---

## Ciclo 3 — até 18/10

**Fatia:** inventário real dos moldes. É isto que destrava tudo.

- [x] Conversar com o gestor sobre o mutirão de cadastro
- [x] Definir a fila: os ~120 produtos que já apareceram em encomenda
- [x] Acompanhar os produtores preenchendo
- [x] Corrigir o que a realidade mostrar que o modelo não previu
- [x] Rodar a capacidade de uma encomenda real com dado majoritariamente
      preenchido
- [x] Sessão de consolidação

**Por que este ciclo importa mais que os outros:** sem inventário, o relatório
de extensão não tem antes-e-depois, o cálculo de custo do Ciclo 4 não tem base,
e qualquer evolução futura (alertas, IA) responderia sobre dado incompleto.

---

## Ciclo 4 — ATUAL - Simulação de encomenda, até 01/11

**Fatia:** analisar uma encomenda nova, antes de produzir, e guardar a análise.

**Por que isto e não o custo do molde:** hoje o sistema só analisa encomendas
já entregues, porque elas vêm de `recibos`. Ele responde sobre o passado. Sem
simulação, não apoia a decisão para a qual foi construído.

Fechar o que sobrou do Ciclo 3:
- [x] Corrigir a frase "sem molde cadastrado" na tela 05 — os moldes estão
      cadastrados, estão é com zero unidades
- [x] Contar no resumo da rota: com molde, em falta, não conferidos
- [x] Rotas de simulação nascem em `routers/simulacoes.py` com APIRouter
      (o `main.py` bateu 504 linhas em 10/10 — gatilho de ~400 disparado;
       migração das rotas antigas fica para a consolidação do ciclo)

A fatia:
- [x] Tabelas `simulacao` e `simulacao_item` no Neon
- [x] Rota POST /api/simulacoes — cria a partir de uma lista de itens
- [x] Rota GET /api/simulacoes — lista as anteriores
- [ ] Rota de capacidade aceitar `simulacao_id` além de `encomenda`
- [ ] Tela: criar simulação a partir do xlsx ou do colar, ver o resultado
- [ ] Resultado imprimível, para mandar à secretária
- [ ] Testar com uma encomenda real recebida
---

## Ciclo 5 — até 17/11

**Fatia:** entrega acadêmica.

- [ ] Relatório de extensão
- [ ] Parte de Gestão da TI: viabilidade, custo, governança, indicador, riscos
- [ ] README do repositório com problema, arquitetura, decisões e prints
- [ ] Evidências: antes e depois, fala do dono e dos produtores

**Material que já existe para o relatório:**
- A frase que motivou o projeto: "fica aquela discussão verbal e nada de dados
  para tomadas de decisão"
- Validação do modelo contra a realidade: previu 13 dias, entrega real levou 21
- Decisões documentadas abaixo, com motivo
- O sistema admitindo o que não sabe (10 de 70) — honestidade como requisito

**Ainda pendente e bloqueante:** o texto da disciplina de extensão e a ementa
de GTI. Sem isso o formato da entrega é adivinhação.

---

## Backlog (próximos ciclos)

- [ ] Relatório imprimível
- [ ] Registrar quem foi o último a alterar cada molde
- [ ] Alertas automáticos: script agendado que avisa quando uma encomenda não
      cabe no prazo, ou quando um molde zera. Usa o `relatorio_moldes.py` que
      já existe — é automação, item da trilha
- [ ] Campos opcionais no PUT de molde (atualizar só o que veio)
- [ ] Unificar o front: quebrar o `index.html` em uma página por tela

---

## Ideias (não fazer ainda)

Cada uma com o gatilho que a tira daqui.

- [ ] **Histórico de quebra de molde** (tabela de unidades em vez de contador).
      Gatilho: quando quiser analisar durabilidade.
- [ ] **Vida útil do molde:** quantas peças aguenta.
- [ ] **Distinguir "molde não cadastrado" de "molde com zero unidades"** — hoje
      os dois caem em `dias_necessarios: null` e o sistema não sabe a diferença.
- [ ] **Decidir o que fazer com a tabela `pecas`** (era teste, não conecta com
      nada).
- [ ] **Login com perfis** (gerente, admin, produtor). Gatilho: quando o sistema
      sair da fábrica, ou quando houver dado que uma pessoa não pode ver da
      outra. É back-end de produto, não engenharia de dados.
- [ ] **IA que responde perguntas em linguagem natural.** Gatilho: inventário
      completo. Com dado parcial, responderia errado com confiança.
- [ ] **Quebrar o `main.py` com APIRouter.** Gatilho: quando passar de ~400
      linhas.
- [ ] **Fluxo de reposição de moldes. Tabela de solicitações:** molde pedido, data do pedido, setor responsável, data de entrega, quantidade, peso. Gerência acompanha prazo. Depende de login por setor. Gatilho: depois de 17/11.
- [ ] **Login por setor — projeto prioritário depois de 17/11.**
      Contexto: a secretária monta a encomenda sem saber quais moldes existem,
      e o produtor vira mensageiro entre ela e o setor de moldes. Com login,
      cada setor vê o que lhe cabe e resolvem entre si — o problema volta para
      quem tem poder de resolver.
      Estimativa: 3–4 semanas (usuários, hash de senha, token, validação nas
      rotas, tela, front guardando o token).
      Por que não agora: não cabe junto com simulação e relatório; e o valor
      pode ser provado antes, mandando o resultado impresso para a secretária.

- [ ] **Custo do molde e ponto de equilíbrio.** Era o Ciclo 4; saiu porque é
      análise, não decisão operacional. Retomar depois da simulação.

      - Enxugar o backend/requirements.txt: tem numpy, pandas e requests que o
  servidor não importa. Todo deploy instala à toa. Sessão própria, com
  deploy conferido depois — é mudança em produção.
- Decidir se o SQLite ainda serve (ficha.db, o if/else do database.py).
  Se não serve, é caminho morto.
- Ver o que tem na pasta backend/ficha-producao — nome do projeto repetido
  lá dentro, provável sobra de cópia.

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
- [x] HAVING — filtrar grupos, não linhas
- [x] DISTINCT
- [ ] Window functions

### Banco
- [x] CREATE TABLE, INSERT
- [x] INSERT ... SELECT (carga em massa dentro do banco)
- [x] Chave estrangeira e UNIQUE
- [x] information_schema (metadado)
- [x] Query parametrizada e SQL injection
- [x] commit só para escrita
- [ ] Índice e desempenho
- [ ] Migração de schema com dado em produção

### Arquitetura
- [x] Três camadas: tela → back-end → banco
- [x] Camada de abstração de dados (o `database.py`)
- [x] Ambiente local vs produção
- [x] Escrever uma rota
- [x] Path vs query parameter — identificar vs filtrar
- [x] Corpo do pedido — endereço identifica, corpo carrega
- [x] Schema: documentação, validação e permissão por recorte
- [x] Códigos de resposta — 4xx culpa de quem pede, 5xx culpa do servidor
- [x] Variável de ambiente
- [ ] Como uma função Python vira JSON

### Python / dados
- [x] POO, ETL com classes
- [x] pandas: leitura, filtro, groupby
- [x] pandas: filtro não altera o DataFrame original
- [x] Consumir API com `requests`
- [x] Tratar erro: ConnectionError, Timeout, HTTPError, resposta vazia
- [x] Escopo: variável morre dentro da função
- [x] Quando tratar erro e quando deixar quebrar
- [ ] Paginação
- [ ] Automação: script que roda sozinho

### Git
- [x] .gitignore é por caminho — `backend/venv/` vs `venv/`
- [x] `git status` entre o add e o commit
- [x] `git reset` desfaz a fila sem tocar nos arquivos
- [x] Branch: experimentar sem mexer no que funciona
- [ ] Resolver conflito de merge

### Depois
- [ ] Docker
- [ ] Cloud (S3 ou GCP)
- [ ] Airflow

---

## Decisões tomadas

- **O usuário da análise é a secretária, não o dono** — ela monta a encomenda
  a partir dos pedidos dos clientes. A análise precisa acontecer antes de a
  encomenda chegar ao produtor, senão ele vira o mensageiro.
- **Simulações em tabela separada, não como marca em `recibos`** — `recibos`
  significa trabalho entregue e conferido com a gerência. Uma simulação ali
  poderia entrar num fechamento de mês por engano, e erro de dinheiro é
  diferente de erro de relatório.
- **Entregar o resultado impresso em vez de dar acesso ao sistema** — prova o
  valor sem depender de login e sem precisar convencer alguém de outra empresa
  a usar um sistema do prestador.
- **A encomenda vem em xlsx e Word da secretária** — formato resolvido, não
  precisa ler PDF.

- **TIMESTAMPTZ, não TIMESTAMP** O servidor do Neon roda em UTC e o trabalho é feito à noite — uma simulação das 21h30 era gravada no dia seguinte. O banco guarda o instante; a conversão é de quem exibe.

### Produto e modelagem

- **Evoluir a Ficha de Produção em vez de criar um sistema novo** — o sistema
  já está em uso, a adoção já existe.
- **Um produto = um modelo de molde, quantidade em coluna** — a fábrica tem
  moldes iguais, não moldes diferentes para o mesmo produto.
- **Molde quebrado vira 0 unidades, sem histórico** — simplicidade, prazo curto.
- **Guardar o que é fato, calcular o que é consequência** — rendimento e
  unidades ficam no banco; capacidade por dia é calculada. Dado guardado
  envelhece; conta se corrige sozinha.
- **`unidades_disponiveis` começa em 0 e existe a coluna `cadastrado`** — o
  sistema precisa admitir o que não sabe em vez de dar número falso.
- **Não modelar o que a fábrica ainda não confirmou** — a estrutura foi feita
  para aguentar expansão, não para adivinhar casos futuros.
- **O modelo não comporta um produto que sai de moldes diferentes** —
  `produto_codigo` é UNIQUE. Se o inventário mostrar o contrário, entra a
  tabela `produto_molde`.
- **O prazo é o MAX, não a média** — os moldes trabalham em paralelo, então
  quem manda é o item mais lento.
- **A API devolve dado, não texto para humano** — `cabe_no_prazo` é `true`/
  `false`, não uma frase. Quem escreve a frase é a tela.

### Limites conhecidos do modelo

- **O sistema calcula capacidade de molde, não de produção.** Encomenda de
  1020 peças: o modelo previu 13 dias, a entrega real levou 21. A diferença
  vem de fatores não modelados — produtores, secagem, acabamento, máquinas.

### Processo e ferramentas

- **Delegar o front, assumir back-end e banco** — o objetivo profissional é
  dados; front não aproxima disso.
- **Cadastro inicial feito pelo `/docs`** — o formulário só entrou depois de
  validado o modelo com dado real.
- **Não usar ferramenta de gestão de projeto** — o gargalo é tempo, não
  coordenação entre pessoas.
- **Padrão de front: uma página por tela.** Links funcionam, arquivos
  independentes, delegação mais segura. O `index.html` com três abas é legado.
- **Arquivar o pipeline de clima (Open-Meteo)** — não é útil comparado ao
  resto; retomar depois de 17/11, se fizer sentido.

### Infraestrutura

- **Local usa connection string direta do Neon (pooling desligado)** — o pooler
  derrubava a conexão de forma intermitente nesta rede. Produção continua com
  pooled.
- **Configuração vive em dois lugares** — o `.env` local e as variáveis do
  Render são independentes. Mudou num, tem que mudar no outro. Senha
  desatualizada no Render já derrubou a produção uma vez.
- **Caminho absoluto, não relativo** — `load_dotenv(BASE_DIR / ".env")`. Onde
  você está não pode decidir se o programa funciona.

## Como quebrar um desafio novo — "de trás pra frente"

Procedimento fixo quando a tarefa é **produzir** algo (relatório, tela, rota).
Faz o desenho de trás pra frente; a execução sai de frente pra trás.

1. **Escrever a resposta final, com números inventados.** A linha, a frase, o
   quadro — exatamente como vai aparecer. Não a pergunta: a resposta.
2. **Circular cada número e cada palavra que varia.** Cada um é uma variável.
   A lista é finita e está na frente.
3. **Para cada variável: de onde ela vem?** Só três respostas possíveis —
   **fato** (está no banco), **agregação** (soma ou contagem de várias linhas),
   **consequência** (sai de outras variáveis). Se não houver resposta, o dado
   não existe: decidir entre medir outra coisa ou criar o registro.
4. **Ordenar: fatos → agregações → consequências.** Essa ordem é o algoritmo.
   Só depois disso, código.

Para problemas de **diagnosticar** (está lento, caiu, o número não bate) o
procedimento é outro: parte do sintoma e vai estreitando.



