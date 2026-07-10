# Architecture — ShopGenie AI Shopping Assistant

## Overview

ShopGenie is a retrieval-augmented generation (RAG) shopping assistant built
as two independent, swappable front ends over one shared recommendation
engine:

1. A **Streamlit demo app** (`app.py`) — single-file, no auth, fastest way
   to test the AI logic.
2. A **production-style full stack** — a FastAPI backend with auth/session
   management and a React (Vite) dashboard frontend.

Both front ends call into the same core Python module, so the retrieval
logic is written once and never duplicated.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                        │
│                                                                     │
│   ┌───────────────────┐          ┌────────────────────────────┐  │
│   │  Streamlit App     │          │   React (Vite) Dashboard    │  │
│   │  app.py            │          │   frontend/src/App.jsx      │  │
│   │  localhost:8501     │          │   localhost:3000            │  │
│   └─────────┬──────────┘          └───────────────┬──────────────┘│
│             │ direct import                        │ REST (fetch)  │
└─────────────┼──────────────────────────────────────┼───────────────┘
              │                                       │
              │                          ┌────────────▼─────────────┐
              │                          │   API Layer (FastAPI)     │
              │                          │   backend/app/main.py     │
              │                          │   localhost:8000/api/*    │
              │                          │                            │
              │                          │  /login  /me  /chats       │
              │                          │  /chat  /ask  /products    │
              │                          │  /categories /wishlist     │
              │                          │  /upload  /templates       │
              │                          └──────┬─────────────┬───────┘
              │                                 │             │
              │                    ┌────────────▼──────┐  ┌───▼────────────┐
              │                    │  Auth & Sessions   │  │  SQLite DB      │
              │                    │  backend/app/auth  │  │  data/app.db    │
              │                    │  .py               │  │  users,sessions,│
              │                    └────────────────────┘  │  chats,messages,│
              │                                             │  wishlist       │
              │                                             └─────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────────────┐
│                    Core Recommendation Engine (RAG)                    │
│                    src/shopping_rag.py — ShoppingRAG class              │
│                                                                          │
│  ┌────────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │ Catalog Loader   │   │ TF-IDF Retrieval  │   │ Persona Answering   │  │
│  │ reads JSON files │──▶│ vectorize + cosine │──▶│ shopper/dealhunter/ │  │
│  │ from data/       │   │ similarity search  │   │ stylist prompts     │  │
│  │ products/         │   │ (scikit-learn)     │   │                     │  │
│  └────────────────┘   └──────────────────┘   └──────────┬──────────┘  │
│                                                            │            │
│                                              ┌─────────────▼──────────┐│
│                                              │  OpenAI Chat Completion ││
│                                              │  (if OPENAI_API_KEY set) ││
│                                              │  else templated fallback ││
│                                              └──────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────────────┐
│                         Data Layer                                    │
│  data/products/*.json  — 200-item demo catalog (auto-generated)       │
│  Electronics · Fashion · Home · Beauty · Sports · Books · Toys ·      │
│  Grocery — each with name, brand, category, price, rating,            │
│  description, features, in_stock                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Component breakdown

### 1. Core engine — `src/shopping_rag.py`
The single source of truth for recommendations. Responsibilities:
- **Catalog loading** — reads product JSON files from `data/products/`, or
  accepts an in-memory list of records (used for uploads and tests).
- **Indexing** — builds a TF-IDF matrix over each product's name, category,
  brand, description, and features.
- **Retrieval** (`search()`) — vectorizes a natural-language query, ranks
  products by cosine similarity, and applies an optional price ceiling
  (parsed from phrases like "under $100").
- **Answer generation** (`answer()`) — assembles retrieved products into a
  context block, applies one of three persona system prompts (**Personal
  Shopper**, **Deal Hunter**, **Style Advisor**), and either calls the
  OpenAI Chat Completions API (`gpt-4o-mini`) if `OPENAI_API_KEY` is set, or
  falls back to a deterministic templated summary if not.
- **Demo data generator** (`build_demo_dataset()`) — produces a 200-product
  catalog across 8 categories on first run, so the app works out of the box
  with no manual data entry.

### 2. Backend API — `backend/app/`
A thin FastAPI service that wraps the core engine with persistence and auth:
- **`main.py`** — route definitions. Loads a singleton `ShoppingRAG`
  instance at startup, seeds the demo catalog if empty, and exposes REST
  endpoints for auth, chat history, catalog browsing, recommendations, and
  wishlist management.
- **`auth.py`** — password hashing (SHA-256) and bearer-token session
  creation/validation. Stateless from the client's perspective: the token
  is stored in `localStorage` and sent as an `Authorization: Bearer <token>`
  header on every authenticated request.
- **`database.py`** — SQLite schema and connection helper. Tables: `users`,
  `sessions`, `chats`, `messages`, `wishlist`. No ORM — plain `sqlite3` with
  row-factory dicts, kept intentionally simple for a demo-scale app.

### 3. Frontend — `frontend/src/App.jsx`
A single-page React app (Vite build, no router) with five views toggled by
local state: **Dashboard**, **Assistant**, **Catalog**, **Wishlist**,
**Settings**. All data comes from the FastAPI backend via `fetch()` calls
proxied through Vite's dev server (`/api/*` → `http://127.0.0.1:8000`).
Charts (spend trend, satisfaction mix, products-by-category) are rendered
with `recharts`; icons with `lucide-react`.

### 4. Streamlit alternative — `app.py`
Imports `ShoppingRAG` directly (no HTTP layer) for a zero-config local demo.
Useful for testing prompt/persona changes quickly, or for users who don't
want to run two servers.

## Request flow (typical "ask a question" interaction, full-stack mode)

1. User signs in → `POST /login` → backend validates against `users` table,
   creates a row in `sessions`, returns a bearer token.
2. Frontend stores the token in `localStorage` and starts a new chat →
   `POST /chat` → row inserted into `chats`.
3. User types a question and picks a persona → `POST /ask` with
   `{question, template}`.
4. Backend calls `ShoppingRAG.answer(question, persona)`:
   - extracts a budget cap from the question text,
   - retrieves the top-k matching products via TF-IDF/cosine similarity,
   - builds a context block from those products,
   - calls the OpenAI API (or falls back to a template) to phrase the
     recommendation.
5. Backend returns `{answer, products, sources}` to the frontend.
6. Frontend renders the answer in the chat, and separately persists both the
   user's question and the assistant's answer via
   `POST /chat/{id}/message` (two calls — one per role) so the conversation
   survives a page reload.

## Design decisions

- **One retrieval engine, two UIs** — avoids duplicating RAG logic between
  the Streamlit demo and the production API.
- **TF-IDF instead of embeddings** — keeps the project dependency-light
  (`scikit-learn` only) and fully offline-capable; swapping in a vector
  store/embedding model later only requires changing `ShoppingRAG.search()`.
- **Graceful LLM fallback** — the app is fully functional without an OpenAI
  key, which matters for local development and demos where a key isn't
  configured.
- **SQLite over a hosted DB** — zero setup for a demo-scale app; the schema
  is simple enough to migrate to Postgres later without redesign.
- **No secrets in the frontend** — the OpenAI key lives only in the backend
  process environment (`OPENAI_API_KEY`) and is never sent to or read by
  the React app.
---------------------------------------------------------------------------------------------------

--------------------------------------------------------------------------------------------------

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
