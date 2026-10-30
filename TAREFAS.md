# Ficha de Produção → Ateliê

**Objetivo até 17/11:** responder, com número, se uma encomenda cabe no prazo
com os moldes que a fábrica tem hoje.

**Problema que isso resolve:** hoje a decisão de aceitar encomenda é discussão
verbal, sem dado. Quando falta molde, a produção fica desfalcada e ninguém
previu.

**Beneficiários:** gerência (decide), secretária (monta encomenda e simula),
produtores (cadastram e usam).

**Status em 07/10:** o sistema responde a pergunta de ponta a ponta — banco,
rotas, tela, em produção. Mas responde sobre **10 de 70 itens**. O gargalo
agora não é técnico: é o inventário dos moldes.

**Status em 28/10:** piloto aprovado pela gerência em 27/10, no setor de peças
pequenas, com a secretária. A partir daqui o sistema deixa de ser só do aluno:
secretária e setor usam. Segurança sobe de prioridade.

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

## Reunião de apresentação — 27/10

Gerência aprovou o **projeto piloto** no setor de peças pequenas, com a
secretária.

### Pedidos levantados

**Segurança e acesso**
1. **Login com perfis:** secretária, produtor, gerência. Hoje a secretária
   consegue alterar molde sem querer. A proteção simples entra no Ciclo 4;
   o login completo fica para depois do piloto, pois temos poucos tempo.

**Secretária**
2. Simular encomenda nova (Ciclo 4).
3. Imprimir lista de moldes em falta para o setor de moldes, com data e de
   qual encomenda ou simulação veio.

**Gerência**
4. Relatório simples, de preferência impresso: o que está atrasado, consumo
   de material, peso, tempo, modelos. Painel/Power BI fica como evolução.
5. Dado novo para isso: peso de cada peça e material gasto por produção.

**Produtor**
6. Registrar chegada do molde: data, quantidade e validade.

**Clareza das telas**
7. Tela de capacidade confusa (mistura encomendas e simulações).
8. Histórico confuso (produtor conferir recibos; secretária consultar).

### Anotações do aluno
9. Acompanhar tempo, custo, capacidade e qualidade — indicadores de melhoria
   contínua (PDCA, Gestão da TI).
10. Peso total da encomenda e custo do quilo da mistura (resina + estireno +
    pó), que a gerência informa.

### Perguntas em aberto (levar à fábrica)
- **Quando a secretária começa a usar de verdade?** Decide a urgência da
  proteção dos moldes.
- **De onde vem o peso de cada peça?** Alguém pesa cada modelo, ou já existe?
  São mais de 200 produtos.
- **"Atrasado" em relação a quê?** O sistema não guarda data prometida.

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
- [x] `cabe_no_prazo` devolver `null` quando `itens_analisados` é 0

---

## Ciclo 3 — concluído, 18/10

**Fatia:** inventário real dos moldes.

- [x] Conversar com o gestor sobre o mutirão de cadastro
- [x] Definir a fila: ~120 produtos que já apareceram em encomenda
- [x] Acompanhar os produtores preenchendo
- [x] Corrigir o que a realidade mostrou que o modelo não previa
- [x] Rodar a capacidade de uma encomenda real com dado majoritariamente
      preenchido
- [x] Sessão de consolidação

**O que destravou:** sem inventário, o relatório de extensão não tinha
antes-e-depois e qualquer evolução futura responderia sobre dado incompleto.

---

## Ciclo 4 — ATUAL — Simulação + proteção, até 04/11

**Fatia:** a secretária simula encomenda nova e vê o resultado, sem risco de
quebrar dado operacional.

**Exceção à Regra 2:** a proteção dos moldes entrou depois do ciclo começar.
Entrou porque a secretária começa a usar no piloto — não cabia esperar o
próximo ciclo. Fica registrada como exceção para não virar precedente
silencioso.

### Em ordem de execução, por prioridade

**1. Proteção dos moldes** — crítica, antes de qualquer coisa
- [X] Rotas que alteram molde (`PUT /api/moldes/{...}`) pedem senha do setor
      de peças pequenas. Consulta continua livre.
- [X] Senha no `.env` local **e** nas variáveis do Render (dois lugares;
      senha desatualizada já derrubou a produção uma vez)
- [x] Tela 04 (cadastro de molde) pede a senha ao salvar

**2. Capacidade devolver `simulacao_id` na resposta** — 2 linhas, rápido
- [x] Quando a origem é simulação, hoje o campo vem nulo e o JSON não diz
      de qual simulação fala

**3. Testar modo Simulação na tela 05** — JS já escrito
- [x] Ler o JS com calma antes de testar
- [x] Testar no navegador: Encomenda igual ao de antes; Simulação carrega
      lista nova e mostra resultado

**4. Tela de criar simulação** — o pedaço maior do ciclo
- [ ] Colar lista (copiada da planilha da secretária)
- [ ] POST `/api/simulacoes` (rota já existe)
- [ ] Mostrar resultado logo depois (reutiliza a tela 05 em modo Simulação)
- *Upload de xlsx fica para depois do piloto.*

**5. Folha impressa de moldes em falta** — para o setor de moldes
- [ ] Com data e de qual encomenda ou simulação veio (rastreio)
- [ ] CSS de impressão

### Consolidação do ciclo (sem funcionalidade nova)
- [ ] Migrar rotas antigas do `main.py` para APIRouter. O `main.py` passou
      de 400 linhas (504 em 10/10) — gatilho disparou.

---

## Ciclo 5 — Clareza e piloto real, até 11/11

**Fatia:** secretária e produtor conseguem usar as telas sem perguntar o que
é cada coisa, e o piloto roda com uma encomenda real.

**Regra deste ciclo:** antes de pedir uma tela ao Claude Code, escrever em
duas ou três frases o que ela precisa responder primeiro. Sem isso, o layout
fica bonito e não resolve a confusão.

- [ ] **Tela de capacidade mais clara** — separar encomenda de simulação.
      Aluno define o que a secretária vê primeiro; Claude Code faz o visual.
- [ ] **Histórico reorganizado.** Aluno escreve o que quer achar ao abrir
      (por exemplo: quanto já entregou este mês, quais recibos são de qual
      encomenda, quanto falta receber). Claude Code faz o visual.
- [ ] **Teste com encomenda real** da secretária, do início ao fim:
      simulação → capacidade → folha impressa.

---

## Ciclo 6 — Entrega acadêmica, até 17/11

**Fatia:** entrega da disciplina de extensão.

- [ ] Relatório de extensão
- [ ] Parte de Gestão da TI: viabilidade, custo, governança, indicadores
      (tempo, custo, capacidade, qualidade) com PDCA, riscos
- [ ] README do repositório com problema, arquitetura, decisões e prints.
      Sem dado sensível (preços, clientes).
- [ ] Evidências: antes e depois, falas da reunião de 27/10

**Material que já existe para o relatório:**
- "fica aquela discussão verbal e nada de dados para tomadas de decisão"
- Validação do modelo contra a realidade: previu 13 dias, entrega real 21
- Decisões documentadas abaixo, com motivo
- O sistema admitindo o que não sabe (10 de 70) — honestidade como requisito
- Reunião de 27/10: aprovação do piloto e pedidos levantados — evidência
  de adoção, não só de desenho

**Ainda pendente e bloqueante:** texto da disciplina de extensão e ementa
de GTI. Sem isso o formato da entrega é adivinhação.

---

## Backlog (depois do piloto)

Ordem sugerida, depois de 17/11:

- [ ] **Login completo por perfil** (secretária, produtor, gerência).
      Prioridade 1 depois de 17/11.
      Contexto: a secretária monta a encomenda sem saber quais moldes
      existem, e o produtor vira mensageiro. Com login, cada perfil vê o
      que lhe cabe, e a senha compartilhada sai.
      Estimativa: 3–4 semanas (usuários, hash de senha, token, validação
      nas rotas, tela, front guardando o token).
  - [ ] Registrar quem foi o último a alterar cada molde (vem junto)
- [ ] **Peso por peça.** Coluna nova no cadastro de produtos.
      Depende da resposta: de onde vem o peso?
- [ ] **Custo do quilo da mistura, guardado com data de vigência.** O preço
      muda; um relatório antigo não pode ser recalculado com o preço de hoje.
  - Peso total da encomenda: soma de quantidade × peso (calculada, não
    guardada).
  - Custo da encomenda: peso total × preço que valia na data.
- [ ] **Chegada de molde:** data, quantidade e validade (preenchidos pelo
      produtor).
- [ ] **Relatório da gerência, impresso:** o que está atrasado, consumo de
      material, peso, tempo, modelos. "Atrasado" depende de data prometida
      (pergunta em aberto).
- [ ] **Indicadores de melhoria contínua (PDCA):** tempo, custo, capacidade,
      qualidade. Começar com o que já sai do banco (tempo e capacidade).
- [ ] **Alertas automáticos:** script agendado que avisa quando uma
      encomenda não cabe no prazo, ou quando um molde zera. Usa o
      `relatorio_moldes.py` — é automação, item da trilha.
- [ ] Campos opcionais no PUT de molde (atualizar só o que veio)
- [ ] **Custo do molde e ponto de equilíbrio.** Era o Ciclo 4 antigo; saiu
      porque é análise, não decisão operacional.
- [ ] Unificar o front: quebrar o `index.html` em uma página por tela

**Limpeza técnica** (sessão própria, com deploy conferido):
- [ ] Enxugar `backend/requirements.txt`: tem numpy, pandas, requests que
      o servidor não importa.
- [ ] Decidir se o SQLite ainda serve (`ficha.db`, if/else do
      `database.py`).
- [ ] Ver o que tem em `backend/ficha-producao` — provável sobra de cópia.
- [ ] Verificar CORS no `main.py`: se estiver `allow_origins=["*"]`,
      qualquer site chama a API pelo navegador.

---

## Ideias (não fazer ainda)

Cada uma com o gatilho que a tira daqui.

- [ ] **Histórico de quebra de molde** (tabela de unidades em vez de
      contador). Gatilho: quando quiser analisar durabilidade.
- [ ] **Vida útil do molde:** quantas peças aguenta.
- [ ] **Distinguir "molde não cadastrado" de "molde com zero unidades"** —
      hoje os dois caem em `dias_necessarios: null`.
- [ ] **Decidir o que fazer com a tabela `pecas`** (era teste).
- [ ] **Painel online ou Power BI para a gerência.** Gatilho: a gerência
      pedir para ver sem imprimir, com o relatório impresso já rodando.
- [ ] **Fluxo de reposição de moldes.** Tabela de solicitações: molde
      pedido, data do pedido, setor responsável, data de entrega. Depende
      do login por perfil.
- [ ] **IA que responde perguntas em linguagem natural.** Gatilho:
      inventário completo.

---

## Trilha de aprendizado

Marcar quando conseguir **explicar com as próprias palavras**, não quando
só tiver usado.

### SQL
- [x] SELECT, WHERE
- [x] INNER JOIN e LEFT JOIN — qual linha vem de onde
- [x] GROUP BY e agregação (SUM, COUNT, MAX)
- [x] COUNT(*) vs COUNT(coluna) — o que é nulo
- [x] Subquery
- [x] Granularidade: somar antes de calcular
- [x] HAVING — filtrar grupos, não linhas
- [x] DISTINCT
- [x] CTE (`WITH`) — nomear consulta e usar como tabela
- [ ] Window functions

### Banco
- [x] CREATE TABLE, INSERT
- [x] INSERT ... SELECT (carga em massa dentro do banco)
- [x] Chave estrangeira e UNIQUE
- [x] information_schema (metadado)
- [x] Query parametrizada e SQL injection
- [x] commit só para escrita
- [x] Transação e atomicidade — nada é definitivo até o commit
- [x] TIMESTAMPTZ × TIMESTAMP
- [ ] Índice e desempenho
- [ ] Migração de schema com dado em produção

### Arquitetura
- [x] Três camadas: tela → back-end → banco
- [x] Camada de abstração de dados (o `database.py`)
- [x] Padrão Adapter (o wrapper que traduz `?` para `%s`)
- [x] Ambiente local vs produção
- [x] Escrever uma rota
- [x] Path vs query parameter — identificar vs filtrar
- [x] Corpo do pedido — endereço identifica, corpo carrega
- [x] Schema: documentação, validação e permissão por recorte
- [x] Códigos de resposta — 4xx culpa de quem pede, 5xx culpa do servidor
- [x] Variável de ambiente
- [x] APIRouter com prefix e tags
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

Uma linha por decisão, com o motivo. É isso que alimenta o README e o
relatório depois.

### Reunião de 27/10 e piloto

- **Proteção dos moldes por senha de setor, antes do login completo.**
  Senha compartilhada não diz quem alterou — é paliativo. Consulta continua
  aberta por enquanto. *(27–28/10)*
- **Exceção à regra "nada entra depois que o ciclo começa":** a proteção
  entra no Ciclo 4 porque a secretária começa a usar no piloto. Registrada
  aqui para não virar precedente silencioso. *(28/10)*
- **Simulação é modo da tela 05, não tela nova.** A regra de cálculo e o
  texto do veredito ficam num lugar só. *(28/10)*
- **Entrada da simulação: colar a lista.** Upload de xlsx fica para depois
  do piloto. *(28/10)*
- **Só se mede o que está anotado.** Tempo e capacidade saem do banco hoje.
  Custo e qualidade precisam de registro antes. *(28/10)*
- **Relatório da gerência é impresso antes de painel.** O gerente não é
  íntimo de tecnologia, e o impresso não depende de login. *(28/10)*
- **Tela nova: aluno define o que ela responde primeiro; Claude Code faz
  o visual.** Front delegado; conteúdo é decisão do aluno. *(28/10)*
- **Modelo de decisão por perfil.** A secretária simula; o produtor
  registra; a gerência lê. Cada um tem sua tela e seu perfil. *(28/10)*

### Produto e modelagem

- **Evoluir a Ficha de Produção em vez de criar um sistema novo** — o
  sistema já está em uso, a adoção já existe.
- **O usuário da análise é a secretária, não o dono** — ela monta a
  encomenda a partir dos pedidos. A análise acontece antes de a encomenda
  chegar ao produtor. *Atualizado em 27/10:* dentro da fábrica, a secretária
  usa o sistema direto no piloto; o impresso continua para o setor de
  moldes, que está fora do sistema.
- **Simulações em tabela separada, não como marca em `recibos`** —
  `recibos` significa trabalho entregue e conferido. Uma simulação ali
  poderia entrar num fechamento de mês por engano.
- **Um produto = um modelo de molde, quantidade em coluna** — a fábrica
  tem moldes iguais, não moldes diferentes para o mesmo produto.
- **Molde quebrado vira 0 unidades, sem histórico** — simplicidade, prazo
  curto.
- **Guardar o que é fato, calcular o que é consequência** — rendimento e
  unidades ficam no banco; capacidade por dia é calculada.
- **Peso total e custo da encomenda não são guardados.** Peso é fato
  (por peça); peso total é soma; custo é peso total vezes o preço que
  valia na data. *(28/10)*
- **Custo do quilo da mistura guarda a data em que o preço passou a
  valer.** O preço muda; relatório antigo não pode ser recalculado com o
  preço de hoje. *(28/10)*
- **`unidades_disponiveis` começa em 0 e existe a coluna `cadastrado`**
  — o sistema precisa admitir o que não sabe em vez de dar número falso.
- **Não modelar o que a fábrica ainda não confirmou** — estrutura feita
  para aguentar expansão, não para adivinhar casos futuros.
- **O modelo não comporta um produto que sai de moldes diferentes** —
  `produto_codigo` é UNIQUE. Se o inventário mostrar o contrário, entra
  a tabela `produto_molde`.
- **O prazo é o MAX, não a média** — os moldes trabalham em paralelo, então
  quem manda é o item mais lento.
- **A API devolve dado, não texto para humano** — `cabe_no_prazo` é
  `true`/`false`, não uma frase. Quem escreve a frase é a tela.
- **A encomenda vem em xlsx e Word da secretária** — formato resolvido,
  não precisa ler PDF.
- **TIMESTAMPTZ, não TIMESTAMP** — o servidor do Neon roda em UTC e o
  trabalho é feito à noite. Uma simulação das 21h30 era gravada no dia
  seguinte.

### Limites conhecidos do modelo

- **O sistema calcula capacidade de molde, não de produção.** Encomenda
  de 1020 peças: previu 13 dias, entrega real levou 21. A diferença vem
  de fatores não modelados — produtores, secagem, acabamento, máquinas.
- **Sem data prometida de entrega.** "Atrasado" não pode ser calculado
  até a fábrica dizer de onde vem a data. *(28/10)*
- **Consulta sem login.** Qualquer pessoa com o endereço do Render lê os
  dados. Só a alteração de molde terá senha, até o login por perfil.
  *(28/10)*

### Processo e ferramentas

- **Delegar o front, assumir back-end e banco** — o objetivo profissional
  é dados; front não aproxima disso.
- **Cadastro inicial feito pelo `/docs`** — o formulário só entrou depois
  de validado o modelo com dado real.
- **Não usar ferramenta de gestão de projeto** — o gargalo é tempo, não
  coordenação entre pessoas.
- **Padrão de front: uma página por tela.** Links funcionam, arquivos
  independentes, delegação mais segura. O `index.html` com três abas é
  legado.
- **Arquivar o pipeline de clima (Open-Meteo)** — não é útil comparado
  ao resto; retomar depois de 17/11 se fizer sentido.

### Infraestrutura

- **Local usa connection string direta do Neon (pooling desligado)** —
  o pooler derrubava a conexão de forma intermitente nesta rede.
  Produção continua com pooled.
- **Configuração vive em dois lugares** — o `.env` local e as variáveis
  do Render são independentes. Senha desatualizada no Render já derrubou
  a produção uma vez.
- **Caminho absoluto, não relativo** — `load_dotenv(BASE_DIR / ".env")`.
  Onde você está não pode decidir se o programa funciona.

---

## Como quebrar um desafio novo — "de trás pra frente"

Procedimento fixo quando a tarefa é **produzir** algo (relatório, tela,
rota). Faz o desenho de trás pra frente; a execução sai de frente pra
trás.

1. **Escrever a resposta final, com números inventados.** A linha, a
   frase, o quadro — exatamente como vai aparecer. Não a pergunta: a
   resposta.
2. **Circular cada número e cada palavra que varia.** Cada um é uma
   variável. A lista é finita e está na frente.
3. **Para cada variável: de onde ela vem?** Só três respostas possíveis
   — **fato** (está no banco), **agregação** (soma ou contagem de várias
   linhas), **consequência** (sai de outras variáveis). Se não houver
   resposta, o dado não existe: decidir entre medir outra coisa ou criar
   o registro.
4. **Ordenar: fatos → agregações → consequências.** Essa ordem é o
   algoritmo. Só depois disso, código.

Para problemas de **diagnosticar** (está lento, caiu, o número não bate)
o procedimento é outro: parte do sintoma e vai estreitando.