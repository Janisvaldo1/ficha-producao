"""
API da Ficha de Produção (J J Marmorite).

Serve também o frontend estático (pasta /frontend) na raiz "/", então rodar
o projeto é só um comando (`uvicorn app.main:app`) — sem precisar de dois
processos separados nem lidar com CORS entre front e back.
"""
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from app.routers import simulacoes

from . import schemas
from .database import get_db, init_db

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = FastAPI(title="Ficha de Produção — J J Marmorite")

app.include_router(simulacoes.router)

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
            "INSERT INTO recibos (data, nota, encomenda, total, qtd_total) VALUES (?, ?, ?, ?, ?)",
            (data_iso, req.nota, (req.encomenda or None), req.total, req.qtd_total),
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
    return schemas.Recibo(id=r["id"], data=r["data"], nota=r["nota"], encomenda=r["encomenda"],
                           itens=itens, total=r["total"], qtd_total=r["qtd_total"])


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
            "UPDATE recibos SET data=?, nota=?, encomenda=?, total=?, qtd_total=? WHERE id=?",
            (data_iso, req.nota, (req.encomenda or None), total, qtd_total, recibo_id),
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


@app.put("/api/encomendas/renomear")
def renomear_encomenda(req: schemas.RenomearEncomendaRequest):
    """Renomeia uma encomenda em todos os recibos que pertencem a ela de uma
    vez — usado pelo botão "Alterar" no rodapé de cada grupo do histórico."""
    conn = get_db()
    try:
        cur = conn.execute("UPDATE recibos SET encomenda=? WHERE encomenda=?", (req.para, req.de))
        conn.commit()
        return {"ok": True, "recibos_afetados": cur.rowcount}
    finally:
        conn.close()


@app.put("/api/encomendas/mover")
def mover_encomenda(req: schemas.MoverEncomendaRequest):
    """Move um lote de recibos já salvos pra uma encomenda de uma vez —
    usado pela seleção múltipla no histórico, pra organizar recibos antigos
    sem precisar abrir e editar cada um."""
    if not req.ids:
        raise HTTPException(400, "Nenhum recibo selecionado.")
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(req.ids))
        cur = conn.execute(
            f"UPDATE recibos SET encomenda=? WHERE id IN ({placeholders})",
            (req.encomenda or None, *req.ids),
        )
        conn.commit()
        return {"ok": True, "recibos_movidos": cur.rowcount}
    finally:
        conn.close()


# ---------- diárias ----------

@app.get("/api/diarias", response_model=List[schemas.Diaria])
def listar_diarias(encomenda: Optional[str] = None):
    """Lista todas as diárias, opcionalmente filtradas por encomenda."""
    conn = get_db()
    try:
        if encomenda:
            rows = conn.execute(
                "SELECT * FROM diarias WHERE encomenda=? ORDER BY data DESC, id DESC",
                (encomenda,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM diarias ORDER BY data DESC, id DESC").fetchall()
        return [schemas.Diaria(
            id=r["id"], encomenda=r["encomenda"], data=r["data"],
            valor=r["valor"], comentario=r["comentario"],
        ) for r in rows]
    finally:
        conn.close()


@app.post("/api/diarias", response_model=schemas.Diaria)
def criar_diaria(req: schemas.CriarDiariaRequest):
    """Cria uma nova diária ligada a uma encomenda."""
    conn = get_db()
    try:
        data_iso = None
        if req.data:
            try:
                data_iso = datetime.fromisoformat(req.data).isoformat()
            except ValueError:
                raise HTTPException(400, "Data inválida — use o formato AAAA-MM-DD.")
        cur = conn.execute(
            "INSERT INTO diarias (encomenda, data, valor, comentario) VALUES (?, ?, ?, ?)",
            (req.encomenda, data_iso, req.valor, req.comentario or None),
        )
        conn.commit()
        diaria_id = cur.lastrowid
        r = conn.execute("SELECT * FROM diarias WHERE id=?", (diaria_id,)).fetchone()
        return schemas.Diaria(
            id=r["id"], encomenda=r["encomenda"], data=r["data"],
            valor=r["valor"], comentario=r["comentario"],
        )
    finally:
        conn.close()


@app.put("/api/diarias/{diaria_id}", response_model=schemas.Diaria)
def editar_diaria(diaria_id: int, req: schemas.EditarDiariaRequest):
    """Edita uma diária existente."""
    conn = get_db()
    try:
        existe = conn.execute("SELECT 1 FROM diarias WHERE id=?", (diaria_id,)).fetchone()
        if not existe:
            raise HTTPException(404, f"Diária {diaria_id} não encontrada.")
        data_iso = None
        if req.data:
            try:
                data_iso = datetime.fromisoformat(req.data).isoformat()
            except ValueError:
                raise HTTPException(400, "Data inválida — use o formato AAAA-MM-DD.")
        conn.execute(
            "UPDATE diarias SET data=?, valor=?, comentario=? WHERE id=?",
            (data_iso, req.valor, req.comentario or None, diaria_id),
        )
        conn.commit()
        r = conn.execute("SELECT * FROM diarias WHERE id=?", (diaria_id,)).fetchone()
        return schemas.Diaria(
            id=r["id"], encomenda=r["encomenda"], data=r["data"],
            valor=r["valor"], comentario=r["comentario"],
        )
    finally:
        conn.close()


@app.delete("/api/diarias/{diaria_id}")
def excluir_diaria(diaria_id: int):
    """Exclui uma diária."""
    conn = get_db()
    try:
        existe = conn.execute("SELECT 1 FROM diarias WHERE id=?", (diaria_id,)).fetchone()
        if not existe:
            raise HTTPException(404, f"Diária {diaria_id} não encontrada.")
        conn.execute("DELETE FROM diarias WHERE id=?", (diaria_id,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.get("/api/moldes", tags=["moldes"])        # 1. verbo + endereço + tag
def listar_moldes(busca: str = None):            # 2. a função e o filtro opcional
    """Lista os moldes. Se `busca` vier, filtra por código ou nome."""
    conn = get_db()                              # 3. abre o banco  [JÁ VIU]
    # 4. roda a query e devolve
    if busca:
        linhas = conn.execute("SELECT * FROM molde WHERE nome ILIKE ? OR produto_codigo ILIKE ?", (f"%{busca}%", f"%{busca}%")).fetchall()
    else:
        linhas = conn.execute("SELECT * FROM molde").fetchall()
    return linhas

@app.put("/api/moldes/{produto_codigo}", tags=["moldes"])
def atualizar_molde(produto_codigo: str, req: schemas.AtualizarMoldeRequest):
    """Atualiza os dados de um molde. Marca como cadastrado."""
    conn = get_db()
    try:
        existe = conn.execute(
            "SELECT 1 FROM molde WHERE produto_codigo=?", (produto_codigo,)
        ).fetchone()
        if not existe:
            raise HTTPException(404, f"Molde do produto {produto_codigo} não encontrado.")

        conn.execute(
            "UPDATE molde SET unidades_disponiveis=?, pecas_por_enchimento=?, "
            "enchimentos_por_dia=?, cadastrado=TRUE WHERE produto_codigo=?",
            (req.unidades_disponiveis, req.pecas_por_enchimento,
             req.enchimentos_por_dia, produto_codigo)
        )
        conn.commit()

        return conn.execute(
            "SELECT * FROM molde WHERE produto_codigo=?", (produto_codigo,)
        ).fetchone()
    finally:
        conn.close()

@app.get("/api/capacidade", tags=["capacidade"])
def consulta_encomenda(encomenda: str, prazo_dias: int = 10):
    conn = get_db()
    consulta = conn.execute("""
    WITH itens AS (
                SELECT i.codigo,
                i.nome,
                i.quantidade
            FROM itens_recibo i
            JOIN recibos r ON r.id = i.recibo_id
            WHERE r.encomenda = ?
        )
        SELECT itens.codigo,
           itens.nome,
           SUM(itens.quantidade) AS quantidade_total,
           molde.cadastrado,
           MAX(molde.unidades_disponiveis * molde.pecas_por_enchimento * molde.enchimentos_por_dia) AS capacidade_dia,
           CEIL(CAST(SUM(itens.quantidade) AS numeric) / 
                -- NULLIF evita a divisão por zero: quando a capacidade do molde dá 0
                -- (molde estragado ou sem unidade), troca o 0 por NULL e a query não trava.
                NULLIF(MAX(molde.unidades_disponiveis * molde.pecas_por_enchimento * molde.enchimentos_por_dia), 0)) AS dias_necessarios 
        FROM itens
        LEFT JOIN molde ON molde.produto_codigo = itens.codigo
        GROUP BY itens.codigo, itens.nome, molde.cadastrado
        ORDER BY dias_necessarios DESC NULLS LAST """, (encomenda,)).fetchall()        
    
    qtd_itens = len(consulta)
    total_pecas = 0
    dias = []
    pior_caso = 0
    itens_em_falta = 0
    itens_nao_conferidos = 0
    
    for linha in consulta:
        total_pecas = total_pecas + linha["quantidade_total"]
        if linha["dias_necessarios"] is not None:
            dias.append(linha["dias_necessarios"])
            if linha["dias_necessarios"] > pior_caso:
                pior_caso = linha["dias_necessarios"]
        else:
            if linha["cadastrado"]:
                itens_em_falta += 1
            else:
                itens_nao_conferidos += 1
    itens_analisados = len(dias)
    cabe_no_prazo = None if itens_analisados == 0 else pior_caso <= prazo_dias
    return {
    "encomenda": encomenda,
    "prazo_dias": prazo_dias,
    "total_pecas": total_pecas,
    "pior_caso_dias": pior_caso,
    "itens_total": qtd_itens,
    "itens_analisados": itens_analisados,
    "cabe_no_prazo": cabe_no_prazo,
    "itens": consulta,
    "itens_em_falta": itens_em_falta,
    "itens_nao_conferidos": itens_nao_conferidos,

}

@app.get("/api/encomendas", tags=["encomendas"])
def listar_encomenda():
    conn = get_db()
    consulta = conn.execute("""SELECT encomenda,
       COUNT(DISTINCT codigo) AS produtos_diferentes,
       SUM(quantidade)        AS total_pecas
FROM itens_recibo i
JOIN recibos r ON r.id = i.recibo_id
GROUP BY encomenda
ORDER BY total_pecas DESC""").fetchall()
    return consulta


 


    
    

# ---------- frontend estático ----------z
# Precisa vir por último: StaticFiles(html=True) captura "/" e qualquer rota
# não reconhecida, então as rotas /api acima têm que estar registradas antes.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
