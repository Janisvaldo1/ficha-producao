"""
Conexão com o banco (SQLite local ou Postgres em produção).

Detecta DATABASE_URL em variáveis de ambiente:
- Se existir: conecta ao Postgres (via psycopg2)
- Se não existir: usa SQLite local (ficha.db)

Ambos os bancos usam o mesmo schema adaptado (SERIAL no Postgres, AUTOINCREMENT no SQLite).
"""
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "ficha.db"
SEED_PATH = BASE_DIR / "data" / "produtos_seed.json"

# Detecta qual banco usar
DATABASE_URL = os.getenv("DATABASE_URL")
USE_POSTGRES = DATABASE_URL is not None

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras
    # psycopg2.extras.DictCursor faz rows acessáveis via row[coluna] e iteráveis


# Schema adaptado para ambos os bancos
SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS produtos (
    codigo TEXT PRIMARY KEY,
    nome   TEXT NOT NULL,
    preco  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS recibos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    data      TEXT NOT NULL,
    nota      TEXT,
    encomenda TEXT,
    total     REAL NOT NULL,
    qtd_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS itens_recibo (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recibo_id  INTEGER NOT NULL REFERENCES recibos(id) ON DELETE CASCADE,
    codigo     TEXT NOT NULL,
    nome       TEXT,
    quantidade REAL NOT NULL,
    preco      REAL NOT NULL,
    subtotal   REAL NOT NULL,
    ok         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS diarias (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    encomenda  TEXT NOT NULL,
    data       TEXT,
    valor      REAL NOT NULL,
    comentario TEXT
);
"""

SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS produtos (
    codigo TEXT PRIMARY KEY,
    nome   TEXT NOT NULL,
    preco  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS recibos (
    id        SERIAL PRIMARY KEY,
    data      TEXT NOT NULL,
    nota      TEXT,
    encomenda TEXT,
    total     REAL NOT NULL,
    qtd_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS itens_recibo (
    id         SERIAL PRIMARY KEY,
    recibo_id  INTEGER NOT NULL REFERENCES recibos(id) ON DELETE CASCADE,
    codigo     TEXT NOT NULL,
    nome       TEXT,
    quantidade REAL NOT NULL,
    preco      REAL NOT NULL,
    subtotal   REAL NOT NULL,
    ok         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS diarias (
    id         SERIAL PRIMARY KEY,
    encomenda  TEXT NOT NULL,
    data       TEXT,
    valor      REAL NOT NULL,
    comentario TEXT
);
"""


def _adapt_query_for_postgres(query: str, params: Optional[Any] = None):
    """Adapta uma query SQLite para Postgres:
    - ? → %s (placeholders posicionais)
    - :nome → %(nome)s (placeholders nomeados)
    - INSERT INTO recibos/itens_recibo/diarias (...) VALUES (...) → ... RETURNING id

    Retorna (query_adaptada, params_adaptados, is_returning_id).
    """
    import re

    # Detecta se tem placeholders nomeados (:nome)
    has_named = ":" in query and re.search(r":\w+", query)

    if has_named:
        # Converte :nome para %(nome)s
        query = re.sub(r":(\w+)", r"%(\1)s", query)
    else:
        # Converte ? para %s
        query = query.replace("?", "%s")

    # Detecta se é um INSERT em tabelas com SERIAL id (para extrair lastrowid)
    # Apenas recibos, itens_recibo, diarias têm auto-increment id
    is_returning_id = False
    query_upper = query.strip().upper()
    if query_upper.startswith("INSERT INTO"):
        # Verifica se é uma tabela com SERIAL id
        if any(table in query_upper for table in ["RECIBOS", "ITENS_RECIBO", "DIARIAS"]):
            # Adiciona RETURNING id para obter o ID gerado
            query = query.rstrip().rstrip(";") + " RETURNING id"
            is_returning_id = True

    return query, params, is_returning_id


class _ConnectionWrapper:
    """Encapsula sqlite3.Connection ou psycopg2.connection para uma interface unificada."""

    def __init__(self, is_postgres: bool, conn):
        self.is_postgres = is_postgres
        self._conn = conn
        self._last_row_id = None

    def execute(self, query: str, params=None):
        """Executa uma query e retorna um Cursor-like (com fetchone, fetchall)."""
        if self.is_postgres:
            query, params, is_returning_id = _adapt_query_for_postgres(query, params)
            cur = self._conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
            if params:
                cur.execute(query, params)
            else:
                cur.execute(query)
            # Se foi INSERT com RETURNING id, extrai o ID
            if is_returning_id:
                row = cur.fetchone()
                self._last_row_id = row["id"] if row else None
                # Armazena a row para que fetchone() do wrapper a retorne
                return _PsycopgCursorWrapper(cur, self, prefetched_row=row)
            else:
                self._last_row_id = None
                return _PsycopgCursorWrapper(cur, self)
        else:
            if params:
                cur = self._conn.execute(query, params)
            else:
                cur = self._conn.execute(query)
            self._last_row_id = cur.lastrowid
            return _SqliteCursorWrapper(cur, self)

    def executescript(self, script: str):
        """Executa múltiplos statements (usado no init_db)."""
        if self.is_postgres:
            # No Postgres, cada statement é executado separadamente
            cur = self._conn.cursor()
            # Remove comentários e divide por ;
            statements = [s.strip() for s in script.split(";") if s.strip()]
            for stmt in statements:
                if stmt:
                    cur.execute(stmt)
            self._conn.commit()
            cur.close()
        else:
            self._conn.executescript(script)
        return self

    def executemany(self, query: str, seq):
        """Executa uma query múltiplas vezes."""
        if self.is_postgres:
            query, _, _ = _adapt_query_for_postgres(query)
            cur = self._conn.cursor()
            for params in seq:
                cur.execute(query, params)
            self._conn.commit()
            cur.close()
        else:
            self._conn.executemany(query, seq)

    def commit(self):
        """Faz commit da transação."""
        if self.is_postgres:
            self._conn.commit()
        else:
            self._conn.commit()

    def close(self):
        """Fecha a conexão."""
        self._conn.close()

    @property
    def lastrowid(self):
        """Retorna o ID da última linha inserida."""
        return self._last_row_id


class _SqliteCursorWrapper:
    """Wrapper para sqlite3.Cursor."""
    def __init__(self, cur, conn_wrapper=None):
        self._cur = cur
        self._conn_wrapper = conn_wrapper

    def fetchone(self):
        row = self._cur.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        return [dict(row) for row in self._cur.fetchall()]

    def __iter__(self):
        for row in self._cur:
            yield dict(row)

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount


class _PsycopgCursorWrapper:
    """Wrapper para psycopg2.cursor com DictCursor."""
    def __init__(self, cur, conn_wrapper, prefetched_row=None):
        self._cur = cur
        self._conn_wrapper = conn_wrapper
        self._prefetched_row = prefetched_row

    def fetchone(self):
        if self._prefetched_row is not None:
            row = self._prefetched_row
            self._prefetched_row = None
            return dict(row) if row else None
        row = self._cur.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        rows = []
        if self._prefetched_row is not None:
            rows.append(dict(self._prefetched_row))
            self._prefetched_row = None
        rows.extend([dict(row) for row in self._cur.fetchall()])
        return rows

    def __iter__(self):
        if self._prefetched_row is not None:
            yield dict(self._prefetched_row)
            self._prefetched_row = None
        for row in self._cur:
            yield dict(row)

    @property
    def lastrowid(self):
        # Retorna o ID armazenado na _ConnectionWrapper
        return self._conn_wrapper._last_row_id if self._conn_wrapper else None

    @property
    def rowcount(self):
        return self._cur.rowcount


def get_db() -> _ConnectionWrapper:
    """Abre uma conexão nova (SQLite ou Postgres conforme DATABASE_URL)."""
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        # Habilita foreign keys no Postgres (padrão)
        return _ConnectionWrapper(is_postgres=True, conn=conn)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.row_factory = sqlite3.Row
        return _ConnectionWrapper(is_postgres=False, conn=conn)


def _migrar_colunas_novas(conn: _ConnectionWrapper) -> None:
    """Adiciona colunas novas em tabelas existentes (migration manual).
    PRAGMA table_info funciona só no SQLite; no Postgres usamos information_schema."""
    if conn.is_postgres:
        # Verifica se coluna 'encomenda' existe em 'recibos' usando information_schema
        row = conn.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name='recibos' AND column_name='encomenda'
        """).fetchone()
        if not row:
            conn.execute("ALTER TABLE recibos ADD COLUMN encomenda TEXT")
            conn.commit()

        # Verifica se tabela 'diarias' existe
        row = conn.execute("""
            SELECT 1 FROM information_schema.tables
            WHERE table_name='diarias'
        """).fetchone()
        if not row:
            conn.execute("""
                CREATE TABLE diarias (
                    id         SERIAL PRIMARY KEY,
                    encomenda  TEXT NOT NULL,
                    data       TEXT,
                    valor      REAL NOT NULL,
                    comentario TEXT
                )
            """)
            conn.commit()
    else:
        # SQLite: usa PRAGMA
        colunas = {row["name"] for row in conn.execute("PRAGMA table_info(recibos)").fetchall()}
        if "encomenda" not in colunas:
            conn.execute("ALTER TABLE recibos ADD COLUMN encomenda TEXT")
            conn.commit()

        tabelas = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if "diarias" not in tabelas:
            conn.executescript("""
                CREATE TABLE diarias (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    encomenda  TEXT NOT NULL,
                    data       TEXT,
                    valor      REAL NOT NULL,
                    comentario TEXT
                );
            """)
            conn.commit()


def init_db() -> None:
    """Cria as tabelas se não existirem e popula com seed de produtos na primeira execução."""
    conn = get_db()
    try:
        schema = SCHEMA_POSTGRES if USE_POSTGRES else SCHEMA_SQLITE
        conn.executescript(schema)
        conn.commit()
        _migrar_colunas_novas(conn)

        row = conn.execute("SELECT COUNT(*) as cnt FROM produtos").fetchone()
        count = row["cnt"] if row else 0
        if count == 0:
            produtos = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            conn.executemany(
                "INSERT INTO produtos (codigo, nome, preco) VALUES (?, ?, ?)",
                [(p["codigo"], p["nome"], p["preco"]) for p in produtos],
            )
            conn.commit()
    finally:
        conn.close()
