# Ficha de Produção — J J Marmorite

Sistema web que uso na fábrica onde trabalho, uma empresa de artesanato em resina e pó de mármore. Começou para resolver um problema meu, calcular quanto eu tinha a receber por lote produzido, e virou uma ferramenta para a fábrica saber se tem molde para atender cada encomenda.

Trabalho na produção, no setor de peças pequenas. Construí o sistema porque sentia o problema todo dia.

## O problema

**Falta informação entre os setores.** A fábrica tem mais de 250 modelos de molde e recebe encomendas de 400 a 500 peças, espalhadas em muitos modelos diferentes. Quando falta um molde ou um material, cada setor reclama, o processo trava e ninguém sabe onde resolver. A encomenda é aceita sem ninguém saber se existe molde para ela, e a decisão vira discussão, não número.

**O cálculo do recibo era manual.** Depois de produzir um lote, recebo um recibo em `.xlsx` só com código, descrição, cor e quantidade, sem valor nenhum. Para saber quanto recebo, eu precisava procurar cada código numa tabela de preços separada e multiplicar à mão. Lento e fácil de errar.

## O que o sistema faz

- Lê o `.xlsx` do recibo e encontra sozinho as colunas de código e quantidade, mesmo que a ordem ou o nome do cabeçalho mudem. Também aceita digitar os itens à mão.
- Cruza cada código com a tabela de preços e calcula o subtotal e o total do recibo.
- Avisa na hora quando um código não está cadastrado, com atalho para cadastrar sem sair da tela.
- Guarda o histórico dos recibos, com resumo do mês e total acumulado.
- Gera um texto de recibo pronto para mandar no WhatsApp ou por e-mail.
- **Capacidade por encomenda** (`/api/capacidade`): para cada peça da encomenda, calcula quantas peças os moldes disponíveis conseguem produzir por dia e quantos dias a peça vai levar. Mostra primeiro as peças mais demoradas, e separa as que estão sem molde disponível ou com molde ainda não cadastrado.

## Situação atual

O sistema roda no setor de peças pequenas, com a secretária e a gerência acompanhando. Estamos num piloto de 60 a 90 dias. Se der resultado, ele vai para os outros setores: peças médias e grandes ocas, moldes, embalagem e expedição.

Levar para outros setores não é só copiar. Cada setor tem suas regras e condições, então o sistema vai precisar ser adaptado a cada um.

## Arquitetura

```
ficha-producao/
├── backend/
│   ├── app/
│   │   ├── main.py        → FastAPI: rotas da API + serve o frontend
│   │   ├── database.py    → conexão com o banco (SQLite ou PostgreSQL) e schema
│   │   ├── schemas.py     → validação de entrada e saída (Pydantic)
│   │   └── routers/       → rotas separadas por assunto
│   ├── data/
│   │   └── produtos_seed.json  → catálogo inicial (174 produtos), usado só
│   │                              para popular o banco na primeira execução
│   ├── scripts/           → scripts de apoio (relatórios)
│   ├── .env.example       → modelo de configuração, sem senha real
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js          → interface + leitura do .xlsx (SheetJS) + chamadas à API
└── README.md
```

**Backend:** Python + [FastAPI](https://fastapi.tiangolo.com/), com SQL escrito à mão, sem ORM. Num projeto desse tamanho, o SQL direto deixa claro o que o banco está fazendo, e é justamente o que quero dominar, porque estou me formando para engenharia de dados.

**Frontend:** HTML, CSS e JavaScript puros, sem framework. O `.xlsx` é lido no navegador com [SheetJS](https://sheetjs.com/). Toda a regra de negócio (cruzar código com preço, calcular total, calcular capacidade) fica no backend.

**Um comando só:** o FastAPI serve o frontend direto (`StaticFiles`), então o projeto inteiro sobe com um único comando, sem dois processos e sem configurar CORS.

### Banco de dados: SQLite no desenvolvimento, PostgreSQL em produção

O sistema escolhe o banco pela variável de ambiente `DATABASE_URL`. Se ela existir, conecta no PostgreSQL (via `psycopg2`). Se não existir, usa um SQLite local (`ficha.db`), criado automaticamente na primeira execução.

Fiz assim porque no meu PC quero testar rápido, sem depender de servidor, e no piloto da fábrica preciso de um banco de verdade. Em produção, o PostgreSQL roda no [Neon](https://neon.tech), um Postgres gerenciado na nuvem. A troca entre os dois é só uma linha no `.env`, o código não muda. O schema é o mesmo nos dois, com pequenas adaptações (`SERIAL` no Postgres, `AUTOINCREMENT` no SQLite).

O arquivo `ficha.db` e o `.env` ficam fora do Git. Só o schema e o catálogo inicial são versionados.

### Modelo de dados

```
produtos       (codigo PK, nome, preco)
recibos        (id PK, data, nota, encomenda, total, qtd_total)
itens_recibo   (id PK, recibo_id FK → recibos, codigo, nome, quantidade, preco, subtotal, ok)
molde          (produto_codigo, unidades_disponiveis, pecas_por_enchimento,
                enchimentos_por_dia, cadastrado, ...)
```

`itens_recibo` guarda uma **cópia** do nome e do preço no momento do cálculo, não uma referência à tabela `produtos`. É de propósito: se o preço mudar depois, os recibos antigos continuam mostrando o valor que foi calculado naquela data. Funciona como uma nota fiscal, que não muda se o preço da loja mudar amanhã.

A capacidade de um molde por dia é `unidades_disponiveis × pecas_por_enchimento × enchimentos_por_dia`. Os dias necessários para uma peça são a quantidade pedida dividida por essa capacidade, arredondada para cima. Quando a capacidade dá zero (molde estragado ou sem unidade), a consulta usa `NULLIF` para não dividir por zero, e a peça aparece no fim da lista como pendência.

## Como rodar

Pré-requisito: Python 3.10+.

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows (Git Bash: source venv/Scripts/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Para usar PostgreSQL, copie o `.env.example` para `.env` e preencha a `DATABASE_URL` (o próprio `.env.example` mostra as opções: Neon, Docker ou Postgres instalado no PC). Sem isso, o sistema roda com SQLite.

Abra `http://127.0.0.1:8000` no navegador. Na primeira execução, o banco é criado e populado com os 174 produtos do catálogo inicial.

## Como o projeto começou

Comecei com um protótipo de um arquivo só, feito com ajuda de IA, para testar a ideia no uso real. Quando ficou claro que resolvia o problema, separei em camadas (dados, regra de negócio e interface) e troquei a persistência por um banco de verdade.

Hoje eu cuido do back-end e do banco de dados.

## Próximos passos

- Terminar a rota de capacidade e mostrar o resultado para a secretária antes de ela fechar a encomenda.
- Concluir o piloto e adaptar o sistema para os outros setores.
- Indicadores para a gerência: quanto tempo cada molde fica parado e onde a produção trava.
- Autenticação simples e registro de quem fez cada alteração, quando mais pessoas passarem a usar.
- Exportar o histórico em `.xlsx` ou PDF.