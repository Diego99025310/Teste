#!/usr/bin/env python3
"""Filtra pedidos validos do arquivo orders_export.csv.

Aplica as regras fornecidas:
1. Apenas linhas com "Name" no formato #numero.
2. Apenas registros com campo "Paid at" preenchido.
3. Apenas pedidos cujo "Discount Code" corresponda a um cupom valido.
4. Apenas registros com "Subtotal" preenchido e maior que zero.

Gera um novo arquivo CSV chamado orders_valid.csv com os pedidos aprovados.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Set, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
ORDERS_PATH = REPO_ROOT / 'orders_export.csv'
VALID_COUPONS_PATH = REPO_ROOT / 'data' / 'valid_coupons.json'
OUTPUT_PATH = REPO_ROOT / 'orders_valid.csv'


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Filtra pedidos validos do Shopify exportados em CSV.'
    )
    parser.add_argument(
        '--input',
        type=Path,
        default=ORDERS_PATH,
        help='Caminho do arquivo CSV a ser validado (padrao: orders_export.csv na raiz do repo).'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=OUTPUT_PATH,
        help='Destino do CSV gerado com pedidos validos (padrao: orders_valid.csv na raiz do repo).'
    )
    parser.add_argument(
        '--coupons',
        type=Path,
        default=VALID_COUPONS_PATH,
        help='Arquivo JSON com a lista de cupons autorizados.'
    )
    parser.add_argument(
        '--stdin',
        action='store_true',
        help='Ler os dados CSV via STDIN em vez de buscar um arquivo.'
    )
    return parser.parse_args()


def load_valid_coupons(path: Path) -> Set[str]:
    try:
        raw_values = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as exc:
        raise SystemExit(f'Arquivo de cupons nao encontrado: {path}') from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f'Arquivo de cupons invalido: {path}\n{exc}') from exc

    if not isinstance(raw_values, list):
        raise SystemExit('Lista de cupons deve ser um array JSON.')

    normalized: Set[str] = set()
    for value in raw_values:
        if not isinstance(value, str):
            raise SystemExit('Todos os cupons devem ser strings.')
        coupon = value.strip()
        if not coupon:
            continue
        normalized.add(coupon.lower())
    if not normalized:
        raise SystemExit('Nenhum cupom valido encontrado no arquivo JSON.')
    return normalized


def is_valid_order(row: Dict[str, Any], valid_coupons: Set[str]) -> bool:
    name = (row.get('Name') or '').strip()
    if not name.startswith('#'):
        return False

    paid_at = (row.get('Paid at') or '').strip()
    if not paid_at:
        return False

    coupon = (row.get('Discount Code') or '').strip()
    if not coupon or coupon.lower() not in valid_coupons:
        return False

    subtotal_raw = (row.get('Subtotal') or '').strip()
    if not subtotal_raw:
        return False

    try:
        subtotal = Decimal(subtotal_raw)
    except InvalidOperation:
        return False
    if subtotal <= 0:
        return False

    return True


def collect_valid_rows(reader: csv.DictReader, valid_coupons: Set[str]) -> Tuple[Sequence[str], List[Dict[str, Any]]]:
    fieldnames: Iterable[str] | None = reader.fieldnames
    if not fieldnames:
        raise SystemExit('Arquivo CSV sem cabecalho.')
    rows = [row for row in reader if is_valid_order(row, valid_coupons)]
    return list(fieldnames), rows


def filter_orders_from_file(source: Path, valid_coupons: Set[str]) -> Tuple[Sequence[str], List[Dict[str, Any]]]:
    with source.open('r', encoding='utf-8', newline='') as input_file:
        reader = csv.DictReader(input_file)
        return collect_valid_rows(reader, valid_coupons)


def filter_orders_from_text(csv_text: str, valid_coupons: Set[str]) -> Tuple[Sequence[str], List[Dict[str, Any]]]:
    cleaned = csv_text.strip()
    if not cleaned:
        raise SystemExit('Nenhum conteudo CSV foi fornecido via STDIN.')
    buffer = io.StringIO(cleaned)
    reader = csv.DictReader(buffer)
    return collect_valid_rows(reader, valid_coupons)


def write_output(destination: Path, fieldnames: Sequence[str], rows: List[Dict[str, Any]]) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('w', encoding='utf-8', newline='') as output_file:
        writer = csv.DictWriter(output_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def filter_orders(source: Path, destination: Path, valid_coupons: Set[str]) -> int:
    fieldnames, rows = filter_orders_from_file(source, valid_coupons)
    write_output(destination, fieldnames, rows)
    return len(rows)


def main() -> None:
    args = parse_arguments()
    coupons = load_valid_coupons(args.coupons)

    if args.stdin:
        csv_text = sys.stdin.read()
        fieldnames, rows = filter_orders_from_text(csv_text, coupons)
    else:
        fieldnames, rows = filter_orders_from_file(args.input, coupons)

    write_output(args.output, fieldnames, rows)
    print(f'Pedidos validos exportados: {len(rows)}')
    print(f'Arquivo gerado em: {args.output.resolve()}')


if __name__ == '__main__':
    main()
