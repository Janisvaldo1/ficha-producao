"""
Conexão com o banco SQLite e criação do schema.

Por que SQLite (e não Postgres/MySQL): é um único arquivo (`ficha.db`), sem
processo de servidor de banco separado pra instalar/rodar — perfeito pra um
projeto de uso individual como este. Se um dia isso precisar servir vários
usuários ao mesmo tempo, aí sim vale migrar pra um banco cliente-servidor.
"""
import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "ficha.db"
SEED_PATH = BASE_DIR / "data" / "produtos_seed.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS produtos (
    codigo TEXT PRIMARY KEY,
    nome   TEXT NOT NULL,
    preco  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS recibos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    data      TEXT NOT NULL,
    nota      TEXT,
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
"""


def get_db() -> sqlite3.Connection:
    """Abre uma conexão nova. FastAPI chama isso por requisição (via Depends)."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Cria as tabelas se não existirem e, na primeira execução, popula a
    tabela de produtos a partir do catálogo original (data/produtos_seed.json).
    Rodar de novo depois não duplica nada: só semeia se a tabela estiver vazia.
    """
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM produtos").fetchone()[0]
        if count == 0:
            produtos = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            conn.executemany(
                "INSERT INTO produtos (codigo, nome, preco) VALUES (:codigo, :nome, :preco)",
                produtos,
            )
            conn.commit()
    finally:
        conn.close()
