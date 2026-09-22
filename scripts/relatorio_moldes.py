import requests
import pandas as pd
import sys

API = "http://localhost:8000/api/moldes"


def buscar_dados():
    """Busca os moldes na API. Devolve a lista, ou None se falhar."""
    try:
        resposta = requests.get(API, timeout=10)
        resposta.raise_for_status()
        return resposta.json()          # ← devolve o resultado
    except requests.exceptions.ConnectionError:
        print("Não consegui falar com o sistema. Ele está no ar?")
        return None                      # ← devolve "nada" em caso de falha
    except requests.exceptions.HTTPError:
        print(f"O sistema respondeu com erro ({resposta.status_code}).")
        return None

    
dados = buscar_dados() 
if dados is None:
    sys.exit(1) 
if not dados:
    print("Nenhum molde encontrado.")
    sys.exit(1)                        

df = pd.DataFrame(dados)

print(df.shape)
print(df.head())

moldes_nao_cadastrado = df[df["cadastrado"] == False]
moldes_cadastrado = df[df["cadastrado"] == True]

print(f"Quantidade de moldes no total: {len(df)} \n"
    f"Quantidade de moldes cadastrados: {len(moldes_cadastrado)} \n"
    f"Quantos moldes faltam para cadastrar: {len(moldes_nao_cadastrado)} \n"
    f"Apenas {len(moldes_nao_cadastrado) / len(df) * 100:.2f}% não foram cadastrados. \n"
    f"E {len(moldes_cadastrado) / len(df) * 100:.2f}% foram cadastrados."
)

print(df["cadastrado"].value_counts(dropna=False))
    
   

