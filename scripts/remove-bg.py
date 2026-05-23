"""
Remove o fundo de todas as imagens em fotos-originais/ e salva
versões PNG sem fundo em uploads/produtos/sem-fundo/.

Uso:
    python scripts/remove-bg.py
    python scripts/remove-bg.py --entrada caminho/pasta --saida outra/pasta

Requer: pip install "rembg[cpu]" pillow
(Na primeira execução baixa o modelo ~170 MB — leva alguns minutos)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Garante cache persistente para não baixar o modelo a cada execução
os.environ.setdefault("REMBG_CACHE_DIR", str(Path.home() / ".cache" / "rembg"))

try:
    from rembg import remove, new_session
    from PIL import Image
except ImportError:
    print("Faltam dependências. Instale com:")
    print('    pip install "rembg[cpu]" pillow')
    sys.exit(1)

EXTENSOES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def processar_pasta(entrada: Path, saida: Path, ok: Path, modelo: str) -> tuple[int, int]:
    saida.mkdir(parents=True, exist_ok=True)
    ok.mkdir(parents=True, exist_ok=True)
    arquivos = sorted(
        f for f in entrada.iterdir()
        if f.is_file() and f.suffix.lower() in EXTENSOES
    )

    if not arquivos:
        print(f"Nenhuma imagem encontrada em {entrada}")
        return 0, 0

    print(f"Carregando modelo '{modelo}'…")
    session = new_session(modelo)
    print(f"Processando {len(arquivos)} imagens…\n")

    sucesso = 0
    erro = 0

    for i, arq in enumerate(arquivos, 1):
        destino = saida / (arq.stem + ".png")
        if destino.exists():
            arq.rename(ok / arq.name)
            print(f"[{i:3}/{len(arquivos)}] PULANDO {arq.name} (já existe, movendo para fotos-ok)")
            sucesso += 1
            continue

        try:
            with Image.open(arq) as img:
                resultado = remove(img, session=session)
            resultado.save(destino, "PNG")
            arq.rename(ok / arq.name)
            print(f"[{i:3}/{len(arquivos)}] OK   {arq.name} -> {destino.name}")
            sucesso += 1
        except Exception as exc:
            print(f"[{i:3}/{len(arquivos)}] ERRO {arq.name}: {exc}")
            erro += 1

    return sucesso, erro


def main() -> int:
    raiz = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Remove fundo das fotos em lote.")
    parser.add_argument(
        "--entrada",
        type=Path,
        default=raiz / "fotos-originais",
        help="Pasta com as fotos originais (padrão: fotos-originais/)",
    )
    parser.add_argument(
        "--saida",
        type=Path,
        default=raiz / "uploads" / "produtos" / "sem-fundo",
        help="Pasta de destino (padrão: uploads/produtos/sem-fundo/)",
    )
    parser.add_argument(
        "--modelo",
        default="birefnet-general",
        help=(
            "Modelo do rembg: u2net (rápido), isnet-general-use (qualidade alta, padrão), "
            "birefnet-general (melhor para objetos detalhados, mais pesado)"
        ),
    )
    args = parser.parse_args()

    if not args.entrada.exists():
        print(f"Pasta de entrada não existe: {args.entrada}")
        print("Crie a pasta e coloque as fotos originais lá.")
        return 1

    ok = args.entrada / "fotos-ok"
    sucesso, erro = processar_pasta(args.entrada, args.saida, ok, args.modelo)
    print()
    print(f"Concluído. Sucesso: {sucesso}, Erros: {erro}")
    print(f"PNGs salvos em: {args.saida}")
    print()
    print("Próximo passo: abra http://localhost:3000/admin e faça upload das fotos")
    print("a partir da pasta acima ao cadastrar cada produto.")
    return 0 if erro == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
