from pathlib import Path

from src.shopping_rag import ShoppingRAG, build_demo_dataset


def test_retrieval_returns_relevant_product(tmp_path: Path):
    build_demo_dataset(tmp_path, count=20)
    rag = ShoppingRAG(tmp_path, top_k=3)

    results = rag.search("wireless headphones", top_k=3)

    assert len(results) == 3
    assert any("headphone" in item["name"].lower() or "electronics" in item["category"].lower() for item in results)


def test_can_initialize_with_inline_records():
    rag = ShoppingRAG(
        data_dir=None,
        records=[{"name": "Custom Trail Backpack", "category": "Sports", "price": 89.0, "rating": 4.5, "description": "Lightweight hiking backpack."}],
        top_k=1,
    )

    assert len(rag.records) == 1
    assert rag.records[0]["name"] == "Custom Trail Backpack"


def test_max_price_filter_excludes_expensive_items():
    build_demo_dataset(Path("/tmp/shopping_rag_test_data"), count=30)
    rag = ShoppingRAG(Path("/tmp/shopping_rag_test_data"), top_k=10)

    results = rag.search("gift", top_k=10, max_price=25)

    assert all(item["price"] <= 25 for item in results)


def test_answer_returns_products_and_sources():
    rag = ShoppingRAG(
        data_dir=None,
        records=[
            {"name": "Aurora Yoga Mat", "category": "Sports", "price": 30.0, "rating": 4.6, "description": "Non-slip yoga mat."},
            {"name": "Aurora Dumbbells", "category": "Sports", "price": 60.0, "rating": 4.4, "description": "Adjustable dumbbells."},
        ],
        top_k=2,
    )

    result = rag.answer("I need home workout gear", persona="dealhunter")

    assert "answer" in result
    assert len(result["products"]) <= 2
    assert len(result["sources"]) == len(result["products"])
