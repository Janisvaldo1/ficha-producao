# Ficha de Produção — J J Marmorite

Ferramenta interna que resolve um problema real de uma pequena empresa de artesanato em resina/pó de mármore: transformar um recibo de produção (só código, descrição, cor e quantidade) em valor a receber, sem precisar cruzar manualmente com uma tabela de preços separada.

## O problema

Na J J Marmorite, depois que um lote de peças é produzido, outro setor lança as peças no sistema interno da empresa e entrega um **recibo** (planilha `.xlsx`) contendo apenas `código`, `descrição`, `cor` e `quantidade` — **sem nenhum valor**. Para saber quanto vai receber, quem produziu precisa abrir uma tabela de preços separada (~174 produtos), procurar cada código manualmente e multiplicar pela quantidade. É lento e sujeito a erro.

## A solução

Um app web que:

- Lê o `.xlsx` do recibo (detectando automaticamente as colunas de código e quantidade, não importa a ordem ou o nome exato do cabeçalho) — ou aceita colar/digitar os itens à mão;
- Cruza cada código com uma tabela de preços própria, calcula o subtotal por item e o total do recibo;
- Sinaliza na hora qualquer código que não esteja cadastrado, com um atalho pra cadastrar o produto sem sair da tela;
- Mantém um histórico dos recibos calculados, com resumo do mês e total acumulado;
- Gera um texto de recibo pronto pra compartilhar (WhatsApp, e-mail etc.).

## Arquitetura

```
ficha-producao/
├── backend/
│   ├── app/
│   │   ├── main.py        → FastAPI: rotas da API + serve o frontend estático
│   │   ├── database.py    → conexão SQLite e criação do schema
│   │   └── schemas.py     → validação de entrada/saída (Pydantic)
│   ├── data/
│   │   └── produtos_seed.json  → catálogo original (174 produtos), usado só
│   │                              pra popular o banco na primeira execução
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js          → UI + parsing de .xlsx (SheetJS) + chamadas à API
└── README.md
```

**Backend:** Python + [FastAPI](https://fastapi.tiangolo.com/) + SQLite, com SQL escrito à mão (sem ORM) — pra um projeto desse tamanho, o SQL direto é mais transparente do que a abstração de um ORM, e conversa melhor com fundamentos de Engenharia de Dados.

**Por que SQLite:** é um único arquivo, sem processo de servidor de banco separado — adequado pra uma ferramenta de uso individual. Ficou de fora do Git (fica de fora do versionamento; só o *schema* e o *seed* de dados são versionados — o banco em si é gerado na primeira vez que a API roda).

**Frontend:** HTML/CSS/JS puro, sem framework nem build step. O parsing do `.xlsx` roda no navegador via [SheetJS](https://sheetjs.com/); toda a lógica de negócio (cruzar código × preço, gerar total) vive no backend.

**Uma decisão de design:** o backend serve o frontend estático diretamente (`StaticFiles` do FastAPI), então o projeto inteiro roda com **um único comando** — sem precisar de dois processos nem configurar CORS entre front e back.

### Modelo de dados

```
produtos       (codigo PK, nome, preco)
recibos        (id PK, data, nota, total, qtd_total)
itens_recibo   (id PK, recibo_id FK → recibos, codigo, nome, quantidade, preco, subtotal, ok)
```

`itens_recibo` guarda uma **cópia** do nome e preço do produto no momento do cálculo (não uma referência viva à tabela `produtos`). Isso é proposital: se o preço de um produto mudar depois, os recibos antigos no histórico continuam mostrando o valor que foi efetivamente calculado naquela data — igual a uma nota fiscal, que não muda retroativamente se o preço da loja mudar amanhã.

## Como rodar

Pré-requisito: Python 3.10+.

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows (Git Bash: source venv/Scripts/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Abra `http://127.0.0.1:8000` no navegador. Na primeira execução, o banco (`backend/ficha.db`) é criado automaticamente e populado com os 174 produtos do catálogo original.

## Origem do projeto

Começou como um protótipo single-file (HTML/CSS/JS num arquivo só, com persistência via uma API exclusiva de ambiente de artifact) pra validar a ideia rapidamente com o uso real. Esta versão separa dados, lógica de negócio e interface em camadas, e troca a persistência por um banco de verdade — o próximo passo natural depois que o protótipo provou que resolvia o problema.

## Próximos passos possíveis

- Deploy num serviço como Render/Railway pra acesso de qualquer dispositivo.
- Autenticação simples, caso mais de uma pessoa da produção passe a usar.
- Automatizar a extração do recibo direto do sistema interno da empresa (se um dia houver uma exportação/API viável), eliminando o passo manual do `.xlsx`.
- Exportar o histórico em `.xlsx`/PDF pra conferência externa.
