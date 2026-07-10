# ShopGenie — GenAI Shopping Assistant

A retrieval-augmented shopping assistant, adapted from a customer-support RAG
template into a full product-recommendation stack:

- **`src/shopping_rag.py`** — TF-IDF retrieval engine (`ShoppingRAG`) over a
  product catalog, with three personas (`shopper`, `dealhunter`, `stylist`)
  and an optional OpenAI-powered answer generator (falls back to a
  deterministic templated answer if no `OPENAI_API_KEY` is set).
- **`app.py`** — standalone Streamlit chat app for quick local demos.
- **`backend/`** — FastAPI service with auth (email/password + session
  tokens), chat history, a live `/products` and `/categories` catalog API,
  a `/wishlist` API, and an `/ask` endpoint that runs the RAG engine.
- **`frontend/`** — React + Vite single-page app (dashboard, AI assistant
  chat, catalog browser, wishlist, settings/catalog upload).
- **`data/products/`** — demo catalog (200 products across Electronics,
  Fashion, Home, Beauty, Sports, Books, Toys, and Grocery), auto-generated
  on first run if empty.

## Quick start — Streamlit demo

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Quick start — full stack (FastAPI + React)

```bash
# Backend
pip install -r backend/requirements.txt
export OPENAI_API_KEY=sk-...   # optional; without it, answers use a templated fallback
uvicorn backend.app.main:app --reload --port 8000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and sign in with the demo account:

- **Email:** `demo@shopgenie.ai`
- **Password:** `demo123`

## Regenerating the demo catalog

```bash
python scripts/generate_products.py --count 200 --out data/products
```

## Bringing your own catalog

Upload a JSON file (list of objects, or a single object) with fields like:

```json
{
  "name": "Aurora Wireless Headphones",
  "brand": "SoundWave",
  "category": "Electronics",
  "price": 89.99,
  "rating": 4.6,
  "description": "Over-ear headphones with 30-hour battery life.",
  "features": ["noise cancelling", "fast charging", "Bluetooth 5.3"],
  "in_stock": true
}
```

via the **Settings** page in the app, or `POST /upload` on the API.

## Tests

```bash
pip install -r requirements.txt
pytest tests/
```
