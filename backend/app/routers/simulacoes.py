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