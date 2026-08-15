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
    itens: List[ItemCalculado]
    total: float
    qtd_total: float


class Recibo(BaseModel):
    id: int
    data: str
    nota: Optional[str] = None
    itens: List[ItemCalculado]
    total: float
    qtd_total: float
