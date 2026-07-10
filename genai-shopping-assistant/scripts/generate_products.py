"""Generate the demo product catalog used by the shopping assistant.

Usage:
    python scripts/generate_products.py [--count 200] [--out data/products]
"""
import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from src.shopping_rag import build_demo_dataset  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a demo product catalog as JSON files.")
    parser.add_argument("--count", type=int, default=200, help="Number of products to generate")
    parser.add_argument("--out", type=str, default="data/products", help="Output directory")
    args = parser.parse_args()

    output_dir = build_demo_dataset(args.out, count=args.count)
    print(f"Wrote {args.count} product records to {output_dir}")


if __name__ == "__main__":
    main()
