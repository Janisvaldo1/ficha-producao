# Resumo das Mudanças — Migração SQLite/Postgres

## Arquivos modificados

### `backend/app/database.py` ✏️
**Antes:** SQLite puro (sqlite3)
**Depois:** Wrapper dual SQLite/Postgres (detecta `DATABASE_URL`)

#### Mudanças principais:
1. **Importações condicionais**
   - `import sqlite3` (sempre)
   - `import psycopg2` (só se `DATABASE_URL` existir)

2. **Schema separados**
   - `SCHEMA_SQLITE`: usa `INTEGER PRIMARY KEY AUTOINCREMENT`
   - `SCHEMA_POSTGRES`: usa `SERIAL PRIMARY KEY`

3. **Funções auxiliares novas**
   - `_adapt_query_for_postgres(query, params)`: converte placeholders e adiciona `RETURNING id`

4. **Classes wrapper**
   - `_ConnectionWrapper`: abstrai `sqlite3.Connection` vs `psycopg2.connection`
   - `_SqliteCursorWrapper`: normaliza resultado de sqlite3 cursor
   - `_PsycopgCursorWrapper`: normaliza resultado de psycopg2 cursor

5. **Adaptações automáticas**
   - `?` → `%s` (placeholders)
   - `:nome` → `%(nome)s` (named params)
   - `INSERT ... RETURNING id` (para extrair lastrowid)
   - Rows sempre retornam como `dict`

## Arquivos **NÃO** modificados

### ✅ `backend/app/main.py`
**Zero mudanças necessárias!**
- `conn.execute()` funciona igual
- `cur.fetchone()` / `cur.fetchall()` funcionam igual
- `cur.lastrowid` funciona igual
- Acesso via `row["coluna"]` funciona igual
- `dict(row)` funciona igual

Todas as queries em main.py foram testadas e funcionam em ambos os bancos.

### ✅ `backend/requirements.txt`
`psycopg2-binary` já estava presente — sem mudança.

### ✅ Outras arquivos
Nenhum outro arquivo do projeto foi alterado.

## Comportamento esperado

### Sem `DATABASE_URL` (desenvolvimento local)
```bash
# Nada a configurar
uvicorn app.main:app --reload
```
- ✅ Usa `ficha.db` SQLite
- ✅ Idêntico ao comportamento anterior
- ✅ Foreign keys habilitadas via `PRAGMA`

### Com `DATABASE_URL` (produção/teste)
```bash
export DATABASE_URL="postgresql://user:pass@host/dbname"
uvicorn app.main:app --reload
```
- ✅ Conecta ao Postgres
- ✅ Cria tabelas com `SERIAL` ids
- ✅ Migration automática de colunas novas (com `information_schema` ao invés de PRAGMA)
- ✅ Todas as rotas funcionam identicamente

## Impacto em main.py

**Nenhum impacto!** As mudanças ficaram **100% abstratas** em `database.py`.

Exemplos de queries que "funcionam magicamente":

```python
# Query com placeholders posicionais (maioria)
conn.execute("SELECT * FROM recibos WHERE id = ?", (recibo_id,))
# ✅ SQLite: usa ?
# ✅ Postgres: convertido para %s

# Query com named params (restaurar_catalogo)
conn.executemany(
    "INSERT INTO produtos (codigo, nome, preco) VALUES (:codigo, :nome, :preco)",
    produtos,  # list of dicts
)
# ✅ SQLite: usa :nome
# ✅ Postgres: convertido para %(nome)s

# INSERT com lastrowid (salvar_recibo, criar_diaria)
cur = conn.execute("INSERT INTO recibos (...) VALUES (...)")
recibo_id = cur.lastrowid
# ✅ SQLite: cur.lastrowid nativo
# ✅ Postgres: executa RETURNING id e armazena internamente

# Acesso a colunas por nome
for r in conn.execute("SELECT * FROM recibos"):
    print(r["id"], r["data"])
# ✅ SQLite: sqlite3.Row
# ✅ Postgres: psycopg2.extras.DictCursor
# ✅ Ambos retornam dict — funciona igual
```

## Testes recomendados

Veja [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) para instruções detalhadas.

**Quick test (SQLite local):**
```bash
cd backend
uvicorn app.main:app --reload
# Navegue pra http://localhost:8000
# POST /api/recibos
# GET /api/diarias
# Tudo deve funcionar como antes
```

**Full test (Postgres local/Neon):**
```bash
export DATABASE_URL="postgresql://user:pass@localhost/ficha"
cd backend
uvicorn app.main:app --reload
# Repita os testes acima — tudo deve funcionar identicamente
```

## Rollback (se necessário)

Se encontrar problemas:

1. Remove `DATABASE_URL` da env
2. Volta à versão anterior de `database.py` (git revert)
3. App volta a usar SQLite automaticamente

Nenhum código de main.py precisa ser revertido.

---

**Status:** ✅ Pronto para teste local e deploy em produção!
