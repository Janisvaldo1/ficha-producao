"""Formatos de entrada/saída da API (validados automaticamente pelo FastAPI)."""
from typing import List, Optional
from pydantic import BaseModel, Field


class Produto(BaseModel):
    codigo: str
    nome: str
    preco: float = Field(ge=0)


class ItemCalculo(BaseModel):
    """Um item bruto vindo do recibo (xlsx ou texto), antes de cruzar com a tabela de preços."""
    codigo: str
    quantidade: float


class CalcularRequest(BaseModel):
    itens: List[ItemCalculo]


class ItemCalculado(BaseModel):
    """Um item já cruzado com a tabela de preços — o que vira uma linha do cupom."""
    codigo: str
    nome: Optional[str] = None
    quantidade: float
    preco: float
    subtotal: float
    ok: bool


class ReciboCalculado(BaseModel):
    itens: List[ItemCalculado]
    total: float
    qtd_total: float
    faltando: List[str]


class SalvarReciboRequest(BaseModel):
    """O que o front manda pra persistir um recibo já calculado (nota + os itens
    calculados, incluindo nome/preço já "congelados" no momento do cálculo)."""
    nota: Optional[str] = None
    encomenda: Optional[str] = None
    """Nome/número da encomenda, pra agrupar vários recibos que pertencem ao
    mesmo pedido. Livre — sem encomenda, o recibo fica avulso."""
    itens: List[ItemCalculado]
    total: float
    qtd_total: float
    data: Optional[str] = None
    """Data do recibo em si (ex: quando o lote foi produzido), no formato
    AAAA-MM-DD. Opcional — pra digitalizar recibos de papel atrasados sem
    que eles entrem no resumo do mês errado. Se omitido, usa a data/hora
    de agora (o comportamento de sempre, pra recibo lançado no mesmo dia)."""


class Recibo(BaseModel):
    id: int
    data: str
    nota: Optional[str] = None
    encomenda: Optional[str] = None
    itens: List[ItemCalculado]
    total: float
    qtd_total: float


class ItemReciboInput(BaseModel):
    """Um item enviado ao editar um recibo já salvo — subtotal não vem daqui,
    o backend recalcula (nunca confia no total que o cliente mandou)."""
    codigo: str
    nome: Optional[str] = None
    quantidade: float
    preco: float


class EditarReciboRequest(BaseModel):
    nota: Optional[str] = None
    encomenda: Optional[str] = None
    data: str
    itens: List[ItemReciboInput]


class RenomearEncomendaRequest(BaseModel):
    de: str
    para: str


class MoverEncomendaRequest(BaseModel):
    ids: List[int]
    encomenda: Optional[str] = None
    """Encomenda de destino pros recibos listados em `ids`. None/vazio move
    pra "sem encomenda" — útil pra desfazer um agrupamento em lote."""


class Diaria(BaseModel):
    id: int
    encomenda: str
    data: Optional[str] = None
    valor: float
    comentario: Optional[str] = None


class CriarDiariaRequest(BaseModel):
    encomenda: str
    data: Optional[str] = None
    valor: float = 120.0
    comentario: Optional[str] = None


class EditarDiariaRequest(BaseModel):
    data: Optional[str] = None
    valor: float
    comentario: Optional[str] = None
