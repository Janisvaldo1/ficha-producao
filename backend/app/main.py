"""
API da Ficha de Produção (J J Marmorite).

Serve também o frontend estático (pasta /frontend) na raiz "/", então rodar
o projeto é só um comando (`uvicorn app.main:app`) — sem precisar de dois
processos separados nem lidar com CORS entre front e back.
"""
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import schemas
from .database import get_db, init_db

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Ficha de Produção — J J Marmorite")


@app.on_event("startup")
def on_startup():
    init_db()


def normalize_codigo(raw: str) -> str:
    s = (raw or "").strip()
    if s.isdigit():
        s = s.zfill(4)
    return s.upper()


# ---------- produtos ----------

@app.get("/api/produtos", response_model=List[schemas.Produto])
def listar_produtos():
    conn = get_db()
    try:
        rows = conn.execute("SELECT codigo, nome, preco FROM produtos ORDER BY codigo").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/produtos", response_model=schemas.Produto)
def criar_ou_atualizar_produto(produto: schemas.Produto):
    """Usado tanto pelo botão '+ Produto' quanto pelo '+ cadastrar' inline no
    recibo: se o código já existe, atualiza; senão, insere (upsert)."""
    codigo = normalize_codigo(produto.codigo)
    if not codigo:
        raise HTTPException(400, "Código não pode ser vazio.")
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO produtos (codigo, nome, preco) VALUES (?, ?, ?)
               ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, preco=excluded.preco""",
            (codigo, produto.nome, produto.preco),
        )
        conn.commit()
        return {"codigo": codigo, "nome": produto.nome, "preco": produto.preco}
    finally:
        conn.close()


@app.put("/api/produtos/{codigo}", response_model=schemas.Produto)
def editar_produto(codigo: str, produto: schemas.Produto):
    """Edição inline da tabela de preços — inclui o caso de renomear o próprio código."""
    conn = get_db()
    try:
        existe = conn.execute("SELECT 1 FROM produtos WHERE codigo=?", (codigo,)).fetchone()
        if not existe:
            raise HTTPException(404, f"Produto {codigo} não encontrado.")
        novo_codigo = normalize_codigo(produto.codigo)
        conn.execute(
            "UPDATE produtos SET codigo=?, nome=?, preco=? WHERE codigo=?",
            (novo_codigo, produto.nome, produto.preco, codigo),
        )
        conn.commit()
        return {"codigo": novo_codigo, "nome": produto.nome, "preco": produto.preco}
    finally:
        conn.close()


@app.delete("/api/produtos/{codigo}")
def remover_produto(codigo: str):
    conn = get_db()
    try:
        conn.execute("DELETE FROM produtos WHERE codigo=?", (codigo,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/produtos/restaurar", response_model=List[schemas.Produto])
def restaurar_catalogo():
    """Apaga a tabela de preços atual e recarrega o catálogo original do seed."""
    import json
    from .database import SEED_PATH

    produtos = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    conn = get_db()
    try:
        conn.execute("DELETE FROM produtos")
        conn.executemany(
            "INSERT INTO produtos (codigo, nome, preco) VALUES (:codigo, :nome, :preco)",
            produtos,
        )
        conn.commit()
        return produtos
    finally:
        conn.close()


# ---------- cálculo de recibo ----------

def _calcular(conn, itens: List[schemas.ItemCalculo]) -> schemas.ReciboCalculado:
    linhas = []
    faltando = []
    total = 0.0
    qtd_total = 0.0

    for item in itens:
        codigo = normalize_codigo(item.codigo)
        row = conn.execute("SELECT nome, preco FROM produtos WHERE codigo=?", (codigo,)).fetchone()
        qtd_total += item.quantidade
        if row:
            subtotal = row["preco"] * item.quantidade
            total += subtotal
            linhas.append(schemas.ItemCalculado(
                codigo=codigo, nome=row["nome"], quantidade=item.quantidade,
                preco=row["preco"], subtotal=subtotal, ok=True,
            ))
        else:
            linhas.append(schemas.ItemCalculado(
                codigo=codigo, nome=None, quantidade=item.quantidade,
                preco=0, subtotal=0, ok=False,
            ))
            faltando.append(codigo)

    return schemas.ReciboCalculado(itens=linhas, total=total, qtd_total=qtd_total, faltando=faltando)


@app.post("/api/recibos/calcular", response_model=schemas.ReciboCalculado)
def calcular_recibo(req: schemas.CalcularRequest):
    """Cruza os itens (código + quantidade) com a tabela de preços. Não salva nada —
    é só o cálculo, igual ao botão 'Calcular valor' do protótipo original."""
    conn = get_db()
    try:
        return _calcular(conn, req.itens)
    finally:
        conn.close()


# ---------- histórico ----------

@app.post("/api/recibos", response_model=schemas.Recibo)
def salvar_recibo(req: schemas.SalvarReciboRequest):
    conn = get_db()
    try:
        if req.data:
            try:
                data_iso = datetime.fromisoformat(req.data).isoformat()
            except ValueError:
                raise HTTPException(400, "Data inválida — use o formato AAAA-MM-DD.")
        else:
            data_iso = datetime.now().isoformat()
        cur = conn.execute(
            "INSERT INTO recibos (data, nota, total, qtd_total) VALUES (?, ?, ?, ?)",
            (data_iso, req.nota, req.total, req.qtd_total),
        )
        recibo_id = cur.lastrowid
        for it in req.itens:
            conn.execute(
                """INSERT INTO itens_recibo (recibo_id, codigo, nome, quantidade, preco, subtotal, ok)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (recibo_id, it.codigo, it.nome, it.quantidade, it.preco, it.subtotal, int(it.ok)),
            )
        conn.commit()
        return _montar_recibo(conn, recibo_id)
    finally:
        conn.close()


def _montar_recibo(conn, recibo_id: int) -> schemas.Recibo:
    r = conn.execute("SELECT * FROM recibos WHERE id=?", (recibo_id,)).fetchone()
    itens_rows = conn.execute(
        "SELECT codigo, nome, quantidade, preco, subtotal, ok FROM itens_recibo WHERE recibo_id=?",
        (recibo_id,),
    ).fetchall()
    itens = [schemas.ItemCalculado(
        codigo=i["codigo"], nome=i["nome"], quantidade=i["quantidade"],
        preco=i["preco"], subtotal=i["subtotal"], ok=bool(i["ok"]),
    ) for i in itens_rows]
    return schemas.Recibo(id=r["id"], data=r["data"], nota=r["nota"], itens=itens,
                           total=r["total"], qtd_total=r["qtd_total"])


@app.get("/api/recibos", response_model=List[schemas.Recibo])
def listar_recibos():
    conn = get_db()
    try:
        ids = [row["id"] for row in conn.execute("SELECT id FROM recibos ORDER BY id DESC").fetchall()]
        return [_montar_recibo(conn, rid) for rid in ids]
    finally:
        conn.close()


@app.delete("/api/recibos")
def limpar_historico():
    conn = get_db()
    try:
        conn.execute("DELETE FROM recibos")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.put("/api/recibos/{recibo_id}", response_model=schemas.Recibo)
def editar_recibo(recibo_id: int, req: schemas.EditarReciboRequest):
    """Corrige um recibo já salvo: nota, data, quantidade/preço de cada item,
    ou remove uma linha (o front manda a lista de itens já sem ela). O
    subtotal e o total nunca vêm do cliente — são sempre recalculados aqui."""
    conn = get_db()
    try:
        existe = conn.execute("SELECT 1 FROM recibos WHERE id=?", (recibo_id,)).fetchone()
        if not existe:
            raise HTTPException(404, f"Recibo {recibo_id} não encontrado.")
        try:
            data_iso = datetime.fromisoformat(req.data).isoformat()
        except ValueError:
            raise HTTPException(400, "Data inválida — use o formato AAAA-MM-DD.")

        total = sum(it.preco * it.quantidade for it in req.itens)
        qtd_total = sum(it.quantidade for it in req.itens)

        conn.execute(
            "UPDATE recibos SET data=?, nota=?, total=?, qtd_total=? WHERE id=?",
            (data_iso, req.nota, total, qtd_total, recibo_id),
        )
        conn.execute("DELETE FROM itens_recibo WHERE recibo_id=?", (recibo_id,))
        for it in req.itens:
            subtotal = it.preco * it.quantidade
            conn.execute(
                """INSERT INTO itens_recibo (recibo_id, codigo, nome, quantidade, preco, subtotal, ok)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (recibo_id, it.codigo, it.nome, it.quantidade, it.preco, subtotal, int(bool(it.nome))),
            )
        conn.commit()
        return _montar_recibo(conn, recibo_id)
    finally:
        conn.close()


@app.delete("/api/recibos/{recibo_id}")
def excluir_recibo(recibo_id: int):
    conn = get_db()
    try:
        existe = conn.execute("SELECT 1 FROM recibos WHERE id=?", (recibo_id,)).fetchone()
        if not existe:
            raise HTTPException(404, f"Recibo {recibo_id} não encontrado.")
        conn.execute("DELETE FROM recibos WHERE id=?", (recibo_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- frontend estático ----------
# Precisa vir por último: StaticFiles(html=True) captura "/" e qualquer rota
# não reconhecida, então as rotas /api acima têm que estar registradas antes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
