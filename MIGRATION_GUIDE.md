# Migração SQLite → Postgres (com suporte dual)

## O que mudou

O arquivo `backend/app/database.py` agora suporta **ambos** SQLite e Postgres automaticamente:

- **Sem `DATABASE_URL`** → usa SQLite local (`ficha.db`) — idêntico ao comportamento anterior
- **Com `DATABASE_URL`** → conecta ao Postgres em produção
- **Adaptação automática** de queries (placeholders `?` → `%s`, SERIAL vs AUTOINCREMENT, etc.)

## Testes em desenvolvimento local

### 1️⃣ Teste local com SQLite (padrão)

```bash
cd backend
# Certifique-se de que NÃO há DATABASE_URL definida
unset DATABASE_URL  # Linux/Mac
# ou em PowerShell:
Remove-Item env:DATABASE_URL

# Rode o app normalmente
uvicorn app.main:app --reload
```

**Esperado:**
- ✅ App conecta no `ficha.db` local (exatamente como antes)
- ✅ Todas as rotas `/api` funcionam normalmente
- ✅ SQLite schema com `INTEGER PRIMARY KEY AUTOINCREMENT`

### 2️⃣ Teste local com Postgres (simulando produção)

Você precisa de um banco Postgres rodando. Opções:

#### Opção A: Neon (recomendado para teste rápido)
1. Vá para [console.neon.tech](https://console.neon.tech)
2. Crie um projeto (free tier)
3. Copie a connection string: `postgresql://user:password@host/dbname`

#### Opção B: Docker local
```bash
docker run -d --name postgres-test \
  -e POSTGRES_DB=ficha \
  -e POSTGRES_PASSWORD=test123 \
  -p 5432:5432 \
  postgres:15
```
Connection string: `postgresql://postgres:test123@localhost:5432/ficha`

#### Opção C: PostgreSQL instalado localmente
```bash
createdb ficha
# Connection string: postgresql://user@localhost/ficha
```

### 3️⃣ Executar teste com Postgres

```bash
cd backend

# Define a variável de ambiente com sua connection string
export DATABASE_URL="postgresql://user:password@host/dbname"  # Linux/Mac
# ou em PowerShell:
$env:DATABASE_URL = "postgresql://user:password@host/dbname"

# Rode o app
uvicorn app.main:app --reload
```

**Esperado:**
- ✅ App conecta ao Postgres (você verá logs de conexão)
- ✅ Cria automaticamente as 4 tabelas com `SERIAL` ids
- ✅ Todas as rotas `/api` funcionam idêntico ao SQLite
- ✅ `/api/produtos/restaurar` popula o seed de produtos

### 4️⃣ Verificar que ambos funcionam

**No SQLite:**
```bash
sqlite3 backend/ficha.db "SELECT * FROM recibos LIMIT 1;"
```

**No Postgres (com Neon ou local):**
```bash
psql postgresql://user:password@host/dbname -c "SELECT * FROM recibos LIMIT 1;"
```

## Pontos técnicos (não precisa mexer em main.py)

### ✅ Compatibilidade automática

O wrapper em `database.py` cuida de:

| Aspecto | SQLite | Postgres | Adaptação |
|---------|--------|----------|-----------|
| Placeholders | `?` | `%s` | Convertido em `_adapt_query_for_postgres()` |
| Named params | `:nome` | `%(nome)s` | Regex replace no wrapper |
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL` | Schema diferente (SCHEMA_SQLITE vs SCHEMA_POSTGRES) |
| `cur.lastrowid` | Nativo | `RETURNING id` | Wrapper armazena em `_ConnectionWrapper._last_row_id` |
| Foreign keys | `PRAGMA foreign_keys = ON` | Padrão | Habilitado automaticamente |
| `row["coluna"]` | `sqlite3.Row` | `psycopg2.extras.DictCursor` | Ambos retornam dicts no wrapper |

### 🔄 Queries que precisam adaptar

**Placeholders posicionais** (maioria em main.py):
```python
# Funciona em ambos:
conn.execute("SELECT * FROM recibos WHERE id = ?", (recibo_id,))
# Convertido internamente para:
# - SQLite: ... WHERE id = ? (mantém)
# - Postgres: ... WHERE id = %s
```

**Named parameters** (restaurar_catalogo):
```python
conn.executemany(
    "INSERT INTO produtos (codigo, nome, preco) VALUES (:codigo, :nome, :preco)",
    produtos,  # lista de dicts
)
# Convertido internamente para:
# - SQLite: ... VALUES (:codigo, :nome, :preco)
# - Postgres: ... VALUES (%(codigo)s, %(nome)s, %(preco)s)
```

**INSERT com lastrowid** (linhas 171-175, 339-344 em main.py):
```python
cur = conn.execute("INSERT INTO recibos (...) VALUES (...)")
recibo_id = cur.lastrowid
# Internamente:
# - SQLite: retorna cur.lastrowid nativo
# - Postgres: executa "... RETURNING id" e armazena o valor
```

## Checklist de produção

Antes de deploy em produção com Postgres:

- [ ] Testar localmente com `DATABASE_URL` do Neon/local
- [ ] Verificar que `/api/produtos` lista produtos
- [ ] Verificar que `/api/recibos` (POST) cria recibos com ID
- [ ] Verificar que `/api/diarias` (POST) cria diárias com ID
- [ ] Remover `ficha.db` do repositório (adicionar ao `.gitignore` se não estiver)
- [ ] Em produção, definir `DATABASE_URL` na env var da plataforma
  - Heroku: `heroku config:set DATABASE_URL=...`
  - PythonAnywhere / Railway / etc: adicionar à config
  - Docker: `docker run -e DATABASE_URL=...`

## Reverter se necessário

Se precisar voltar ao SQLite puro:

1. Remove `DATABASE_URL` da env
2. Restaura o `ficha.db` de um backup (se tiver)
3. Reinicia a app

Nenhuma mudança de código é necessária — o wrapper detecta automaticamente.

## Troubleshooting

### "psycopg2 not installed"
```bash
pip install psycopg2-binary
```

### "connection refused" (Postgres não está rodando)
```bash
# Verifique que Postgres está ativo
psql postgresql://user:password@host/dbname -c "SELECT 1;"
```

### "database already exists" (Postgres)
Postgres cria automaticamente quando `CREATE TABLE IF NOT EXISTS` roda. Sem problema.

### "permission denied" (Postgres em Neon)
Verifique que a connection string tem o usuário/password corretos. Neon gera automaticamente.

### "ON CONFLICT error" (Postgres)
A sintaxe `ON CONFLICT(codigo) DO UPDATE` funciona em ambos — sem mudança necessária.

---

**Resumo:** Rode localmente, não toque em main.py, e deploy com `DATABASE_URL` em produção. ✨
