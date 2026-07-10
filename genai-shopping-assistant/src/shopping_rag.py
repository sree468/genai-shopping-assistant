from __future__ import annotations

import json
import os
import random
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import requests
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class ShoppingRAG:
    """Retrieval-augmented product recommendation engine.

    Loads a catalog of products (from JSON files or an inline list),
    builds a TF-IDF index over product text (name + category + description +
    features), and answers natural-language shopping questions by retrieving
    the most relevant products and optionally asking an LLM to turn the
    retrieved context into a helpful, persona-driven recommendation.
    """

    def __init__(
        self,
        data_dir: str | Path | None = None,
        top_k: int = 5,
        records: List[Dict[str, Any]] | None = None,
    ):
        self.data_dir = Path(data_dir) if data_dir is not None else None
        self.top_k = top_k
        self.records: List[Dict[str, Any]] = []
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.matrix = None
        self._load_data(records=records)

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------
    def _normalize(self, item: Dict[str, Any], source: str) -> Dict[str, Any]:
        return {
            "name": item.get("name") or item.get("title") or "Unnamed product",
            "category": item.get("category", "General"),
            "price": float(item.get("price", 0) or 0),
            "rating": float(item.get("rating", 0) or 0),
            "description": item.get("description") or item.get("summary") or "",
            "features": item.get("features", []),
            "brand": item.get("brand", "Generic"),
            "in_stock": item.get("in_stock", True),
            "source": source,
        }

    def _load_data(self, records: List[Dict[str, Any]] | None = None) -> None:
        rows: List[Dict[str, Any]] = []

        if records:
            rows = [self._normalize(item, item.get("source", "inline")) for item in records if item.get("name") or item.get("title")]
        elif self.data_dir is not None:
            files = sorted(self.data_dir.glob("*.json"))
            if not files:
                raise FileNotFoundError(f"No JSON product files found in {self.data_dir}")

            for file_path in files:
                try:
                    with file_path.open("r", encoding="utf-8") as handle:
                        payload = json.load(handle)
                except Exception:
                    continue

                if isinstance(payload, dict):
                    payload = [payload]
                for item in payload:
                    if item.get("name") or item.get("title"):
                        rows.append(self._normalize(item, file_path.name))
        else:
            raise ValueError("Either data_dir or records must be provided")

        self.records = rows
        if not self.records:
            raise ValueError("No product records were loaded")

        texts = [
            f"{r['name']} {r['category']} {r['brand']} {r['description']} {' '.join(r['features'])}"
            for r in self.records
        ]
        self.matrix = self.vectorizer.fit_transform(texts)

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------
    def search(self, query: str, top_k: int | None = None, max_price: float | None = None) -> List[Dict[str, Any]]:
        top_k = top_k or self.top_k
        query_vec = self.vectorizer.transform([query])
        scores = cosine_similarity(query_vec, self.matrix).ravel()
        order = np.argsort(scores)[::-1]

        results: List[Dict[str, Any]] = []
        for idx in order:
            record = self.records[idx]
            if max_price is not None and record["price"] > max_price:
                continue
            results.append({**record, "score": float(scores[idx])})
            if len(results) >= top_k:
                break
        return results

    # ------------------------------------------------------------------
    # Answer generation
    # ------------------------------------------------------------------
    def answer(self, question: str, persona: str = "shopper", top_k: int | None = None) -> Dict[str, Any]:
        max_price = self._extract_budget(question)
        matches = self.search(question, top_k=top_k, max_price=max_price)
        if not matches:
            return {"answer": "I couldn't find a matching product in the catalog for that request.", "sources": [], "products": []}

        context = "\n\n".join(
            f"Product: {m['name']} | Brand: {m['brand']} | Category: {m['category']} | "
            f"Price: ${m['price']:.2f} | Rating: {m['rating']}/5\n"
            f"Description: {m['description']}\nFeatures: {', '.join(m['features']) or 'n/a'}"
            for m in matches
        )

        system_prompts = {
            "shopper": (
                "You are a friendly personal shopping assistant. Use the retrieved product catalog to "
                "recommend the best matching items, explain why each fits the customer's needs, and suggest "
                "one clear next step (e.g. add to cart, compare, or ask a follow-up)."
            ),
            "dealhunter": (
                "You are a budget-focused deal hunter. Use the retrieved product catalog to highlight the best "
                "value options, call out price-to-rating tradeoffs, and flag anything that looks like the best deal."
            ),
            "stylist": (
                "You are a style and fit advisor. Use the retrieved product catalog to recommend items that suit "
                "the customer's taste and occasion, describing look, feel, and how pieces pair together."
            ),
        }
        system_prompt = system_prompts.get(persona, system_prompts["shopper"])

        api_key = os.getenv("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")
        if api_key:
            try:
                payload = {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": f"Customer question: {question}\n\nRetrieved catalog matches:\n{context}",
                        },
                    ],
                    "temperature": 0.4,
                }
                response = requests.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=payload,
                    timeout=30,
                )
                if response.ok:
                    content = response.json()["choices"][0]["message"]["content"]
                    return {
                        "answer": content,
                        "sources": [m["source"] for m in matches],
                        "products": matches,
                    }
            except Exception:
                pass

        # Fallback: deterministic templated answer if no LLM key is configured.
        lines = [f"Here are the top matches I found for \"{question}\":", ""]
        for m in matches:
            lines.append(f"- {m['name']} ({m['brand']}) — ${m['price']:.2f}, {m['rating']}/5 stars. {m['description']}")
        answer = "\n".join(lines)
        return {"answer": answer, "sources": [m["source"] for m in matches], "products": matches}

    @staticmethod
    def _extract_budget(question: str) -> float | None:
        """Very light heuristic: pull a '$123' or 'under 50' style budget cap out of the question."""
        import re

        match = re.search(r"under\s*\$?(\d+(?:\.\d+)?)", question.lower())
        if not match:
            match = re.search(r"\$(\d+(?:\.\d+)?)", question)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None
        return None


# ----------------------------------------------------------------------
# Demo catalog generator
# ----------------------------------------------------------------------
CATEGORIES = {
    "Electronics": {
        "items": ["Wireless Headphones", "Smartwatch", "Bluetooth Speaker", "4K Monitor", "Mechanical Keyboard", "Action Camera", "Power Bank", "Noise-Cancelling Earbuds"],
        "brands": ["SoundWave", "PixelPro", "NovaTech", "CircuitOne"],
        "features": ["long battery life", "fast charging", "water resistant", "wireless connectivity", "touch controls", "HD display"],
        "price_range": (25, 450),
    },
    "Fashion": {
        "items": ["Running Shoes", "Denim Jacket", "Wool Sweater", "Leather Wallet", "Sunglasses", "Backpack", "Sneakers", "Winter Coat"],
        "brands": ["Urban Thread", "StrideCo", "Northline", "Aster & Vale"],
        "features": ["breathable fabric", "slim fit", "hand-stitched", "machine washable", "UV protection", "adjustable straps"],
        "price_range": (18, 220),
    },
    "Home": {
        "items": ["Air Purifier", "Robot Vacuum", "Cast Iron Skillet", "Standing Desk", "Weighted Blanket", "Coffee Maker", "Smart Thermostat", "Table Lamp"],
        "brands": ["HearthHome", "PureAir", "OakAndIron", "LumenLiving"],
        "features": ["energy efficient", "app controlled", "easy to clean", "compact design", "quiet operation", "eco-friendly materials"],
        "price_range": (20, 500),
    },
    "Beauty": {
        "items": ["Vitamin C Serum", "Hair Dryer", "Electric Razor", "Facial Cleanser", "Perfume", "Makeup Palette", "Moisturizer", "Hair Straightener"],
        "brands": ["Glow Lab", "PureSkin", "Aurelia", "DermaCare"],
        "features": ["cruelty-free", "dermatologist tested", "fragrance-free", "long-lasting", "travel size available", "all skin types"],
        "price_range": (8, 120),
    },
    "Sports": {
        "items": ["Yoga Mat", "Adjustable Dumbbells", "Cycling Helmet", "Camping Tent", "Hiking Backpack", "Resistance Bands", "Insulated Water Bottle", "Fitness Tracker"],
        "brands": ["PeakForm", "TrailBound", "IronCore", "SummitGear"],
        "features": ["lightweight", "non-slip grip", "weatherproof", "adjustable resistance", "shock absorbing", "quick-dry material"],
        "price_range": (12, 350),
    },
    "Books": {
        "items": ["Mystery Novel", "Cookbook", "Self-Help Guide", "Sci-Fi Anthology", "History Book", "Children's Picture Book", "Business Strategy Book", "Poetry Collection"],
        "brands": ["Lanternfish Press", "Cobblestone Books", "Meridian House", "Willow & Pine"],
        "features": ["bestseller", "illustrated edition", "hardcover", "award winning", "beginner friendly", "includes workbook"],
        "price_range": (6, 45),
    },
    "Toys": {
        "items": ["Building Block Set", "Remote Control Car", "Puzzle 1000pc", "Plush Toy", "Board Game", "Art Supply Kit", "STEM Robot Kit", "Outdoor Play Tent"],
        "brands": ["Kinderplay", "Bright Bricks", "Wonderworks", "PlayNest"],
        "features": ["educational", "non-toxic materials", "encourages creativity", "easy assembly", "durable design", "ages 3+"],
        "price_range": (10, 90),
    },
    "Grocery": {
        "items": ["Organic Coffee Beans", "Protein Powder", "Herbal Tea Set", "Olive Oil", "Granola Mix", "Sparkling Water Pack", "Dark Chocolate Bar", "Trail Mix"],
        "brands": ["Harvest & Co", "GreenLeaf", "Sunwell Farms", "Nutrivo"],
        "features": ["organic", "non-GMO", "no added sugar", "sustainably sourced", "resealable packaging", "gluten-free"],
        "price_range": (4, 40),
    },
}


def build_demo_dataset(output_dir: str | Path, count: int = 200, seed: int = 42) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)

    category_names = list(CATEGORIES.keys())
    records = []
    for i in range(count):
        category = category_names[i % len(category_names)]
        spec = CATEGORIES[category]
        item = rng.choice(spec["items"])
        brand = rng.choice(spec["brands"])
        low, high = spec["price_range"]
        price = round(rng.uniform(low, high), 2)
        rating = round(rng.uniform(3.4, 5.0), 1)
        features = rng.sample(spec["features"], k=min(3, len(spec["features"])))
        name = f"{brand} {item}"
        description = (
            f"The {name} is a top pick in {category.lower()}, known for {features[0]} and {features[1]}. "
            f"Customers say it delivers great value at ${price:.2f} with a {rating}/5 average rating."
        )
        records.append(
            {
                "name": name,
                "brand": brand,
                "category": category,
                "price": price,
                "rating": rating,
                "description": description,
                "features": features,
                "in_stock": rng.random() > 0.08,
            }
        )

    for idx, record in enumerate(records):
        file_path = output_dir / f"product_{idx + 1:03d}.json"
        with file_path.open("w", encoding="utf-8") as handle:
            json.dump(record, handle, indent=2)

    return output_dir
