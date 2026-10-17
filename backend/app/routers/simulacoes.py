from fastapi import APIRouter
from app import schemas
from app.database import get_db

router = APIRouter(prefix="/api/simulacoes", tags=["simulacoes"])

@router.post("", status_code=201)
def simulacao(req: schemas.CriarSimulacaoRequest ):
    conn = get_db()
    try:
        simulacao_id = conn.execute("""INSERT INTO simulacao (observacao)
        VALUES (?) RETURNING id;""", (req.observacao,)).fetchone()["id"]

        for item in req.itens:
            conn.execute(
                """INSERT INTO simulacao_item (simulacao_id, codigo, quantidade)
                VALUES  (?, ?, ?)""",
                (simulacao_id, item.codigo, item.quantidade )
            )
        conn.commit()
        return conn.execute(
            "SELECT * FROM simulacao WHERE simulacao.id =?", (simulacao_id,)
        ).fetchone()
    finally:
        conn.close()

@router.get("")
def listar_simulacoes():
    conn = get_db()
    try:
        consulta = conn.execute("""
        SELECT simulacao.id, data, observacao,
            COUNT(DISTINCT simulacao_item.codigo) AS produtos_diferentes,
            SUM(quantidade)        AS total_pecas
        FROM simulacao
        JOIN simulacao_item ON simulacao_item.simulacao_id = simulacao.id
    GROUP BY simulacao.id, data, observacao
    ORDER BY data DESC """).fetchall()
        return consulta
    finally:
        conn.close()
