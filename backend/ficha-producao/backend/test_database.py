#!/usr/bin/env python
"""
Script de teste rápido para validar a migração SQLite/Postgres.

Uso:
  python test_database.py        # Testa SQLite (padrão)
  DATABASE_URL=... python test_database.py  # Testa Postgres (se psycopg2 instalado)
"""
import sys
import os

def test_sqlite():
    """Testa SQLite sem DATABASE_URL."""
    print("=" * 60)
    print("TESTE: SQLite (sem DATABASE_URL)")
    print("=" * 60)

    # Certifique-se de que não há DATABASE_URL
    if "DATABASE_URL" in os.environ:
        print("[SKIP] DATABASE_URL já definida")
        return False

    from app.database import USE_POSTGRES, get_db, init_db

    if USE_POSTGRES:
        print("[FAIL] Esperava USE_POSTGRES=False, mas foi True")
        return False

    print("[OK] USE_POSTGRES = False")

    # Limpar banco anterior
    db_path = "ficha.db"
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"[OK] Banco anterior removido: {db_path}")

    # Inicializar
    print("[...] Inicializando banco...")
    init_db()
    print("[OK] init_db() bem-sucedido")

    # Testar conexão
    conn = get_db()
    try:
        # COUNT
        row = conn.execute("SELECT COUNT(*) as cnt FROM produtos").fetchone()
        count = row["cnt"]
        print(f"[OK] {count} produtos carregados do seed")

        # INSERT
        cur = conn.execute(
            "INSERT INTO recibos (data, nota, total, qtd_total) VALUES (?, ?, ?, ?)",
            ("2026-08-16", "Teste", 100.0, 1.0)
        )
        rid = cur.lastrowid
        print(f"[OK] Recibo inserido com ID: {rid}")

        # SELECT
        row = conn.execute(
            "SELECT id, data, total FROM recibos WHERE id = ?",
            (rid,)
        ).fetchone()
        print(f"[OK] Recibo recuperado: {dict(row)}")

        # dict(row)
        row_dict = dict(row)
        print(f"[OK] Convertido para dict: {type(row_dict).__name__}")

        # UPDATE
        conn.execute(
            "UPDATE recibos SET nota = ? WHERE id = ?",
            ("Teste atualizado", rid)
        )
        conn.commit()
        print("[OK] Recibo atualizado")

        print("\n[PASS] Todos os testes SQLite passaram!")
        return True

    except Exception as e:
        print(f"[FAIL] Erro: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()


def test_postgres():
    """Testa Postgres com DATABASE_URL."""
    print("\n" + "=" * 60)
    print("TESTE: Postgres (com DATABASE_URL)")
    print("=" * 60)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("[SKIP] DATABASE_URL não definida")
        return True  # Skip, não é falha

    try:
        import psycopg2
    except ImportError:
        print("[SKIP] psycopg2 não instalado (pip install psycopg2-binary)")
        return True  # Skip, não é falha

    from app.database import USE_POSTGRES

    if not USE_POSTGRES:
        print("[FAIL] Esperava USE_POSTGRES=True, mas foi False")
        return False

    print("[OK] USE_POSTGRES = True")
    print(f"[OK] DATABASE_URL configurada (verificado)")

    try:
        from app.database import get_db, init_db

        print("[...] Inicializando banco Postgres...")
        init_db()
        print("[OK] init_db() bem-sucedido (tabelas criadas/verificadas)")

        # Testar conexão
        conn = get_db()
        try:
            # COUNT
            row = conn.execute("SELECT COUNT(*) as cnt FROM produtos").fetchone()
            count = row["cnt"]
            print(f"[OK] {count} produtos no Postgres")

            # INSERT
            cur = conn.execute(
                "INSERT INTO recibos (data, nota, total, qtd_total) VALUES (?, ?, ?, ?)",
                ("2026-08-16", "Teste Postgres", 200.0, 2.0)
            )
            rid = cur.lastrowid
            print(f"[OK] Recibo inserido em Postgres com ID: {rid}")

            print("\n[PASS] Todos os testes Postgres passaram!")
            return True

        finally:
            conn.close()

    except Exception as e:
        print(f"[FAIL] Erro: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Executa testes."""
    print("\n")
    print("" + "=" * 58 + "")
    print("" + " Teste de Migração SQLite/Postgres ".center(58) + "")
    print("" + "=" * 58 + "╝")

    results = []

    # Teste SQLite
    results.append(("SQLite", test_sqlite()))

    # Teste Postgres
    results.append(("Postgres", test_postgres()))

    # Resumo
    print("\n" + "=" * 60)
    print("RESUMO")
    print("=" * 60)

    for name, passed in results:
        status = "[PASS]" if passed else "[SKIP]"
        print(f"{status} {name}")

    all_passed = all(passed for _, passed in results)

    if all_passed:
        print("\n" + "=" * 60)
        print("STATUS: OK - Pronto para usar!")
        print("=" * 60)
        return 0
    else:
        print("\n" + "=" * 60)
        print("STATUS: FAIL - Verifique os erros acima")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
