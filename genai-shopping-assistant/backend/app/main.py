import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(str(Path(__file__).resolve().parents[2]))

from src.shopping_rag import ShoppingRAG, build_demo_dataset  # noqa: E402

from .auth import authenticate_user, create_session, validate_session
from .database import get_connection, init_db, seed_demo_user

app = FastAPI(title="GenAI Shopping Assistant")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "products"
DATA_DIR.mkdir(parents=True, exist_ok=True)
init_db()
seed_demo_user()

PERSONAS = {
    "shopper": "Personal Shopper — friendly, needs-based recommendations",
    "dealhunter": "Deal Hunter — best value and budget-conscious picks",
    "stylist": "Style Advisor — taste, fit, and occasion focused",
}

_rag: Optional[ShoppingRAG] = None


def get_rag(force_reload: bool = False) -> ShoppingRAG:
    global _rag
    if _rag is None or force_reload:
        if not any(DATA_DIR.glob("*.json")):
            build_demo_dataset(DATA_DIR, count=200)
        _rag = ShoppingRAG(DATA_DIR, top_k=5)
    return _rag


def require_user(authorization: Optional[str]) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.replace("Bearer ", "", 1)
    user = validate_session(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/login")
def login(payload: Dict[str, str]) -> Dict[str, Any]:
    email = payload.get("email", "")
    password = payload.get("password", "")
    user = authenticate_user(email, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(user["id"])
    return {"token": token, "user": {"email": user["email"], "full_name": user["full_name"], "role": user["role"]}}


@app.get("/me")
def me(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = require_user(authorization)
    return {"user": {"email": user["email"], "full_name": user["full_name"], "role": user["role"]}}


@app.get("/chats")
def chats(authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
    user = require_user(authorization)
    conn = get_connection()
    rows = conn.execute("SELECT * FROM chats WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/chat")
def create_chat(payload: Dict[str, Any], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = require_user(authorization)
    title = payload.get("title", "New shopping session")
    conn = get_connection()
    cursor = conn.execute("INSERT INTO chats (user_id, title) VALUES (?, ?)", (user["id"], title))
    conn.commit()
    chat_id = cursor.lastrowid
    conn.close()
    return {"id": chat_id, "title": title}


@app.get("/chat/{chat_id}/messages")
def get_messages(chat_id: int, authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
    require_user(authorization)
    conn = get_connection()
    rows = conn.execute("SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC", (chat_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/chat/{chat_id}/message")
def save_message(chat_id: int, payload: Dict[str, str], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    role = payload.get("role", "assistant")
    content = payload.get("content", "")
    conn = get_connection()
    conn.execute("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)", (chat_id, role, content))
    conn.commit()
    conn.close()
    return {"status": "saved"}


@app.get("/templates")
def list_templates() -> Dict[str, Any]:
    return {"templates": list(PERSONAS.keys()), "descriptions": PERSONAS}


@app.get("/products")
def list_products(q: Optional[str] = None, category: Optional[str] = None, max_price: Optional[float] = None) -> Dict[str, Any]:
    rag = get_rag()
    if q:
        results = rag.search(q, top_k=24, max_price=max_price)
    else:
        results = [{**r, "score": 1.0} for r in rag.records]
        if max_price is not None:
            results = [r for r in results if r["price"] <= max_price]
        results = results[:60]
    if category:
        results = [r for r in results if r["category"].lower() == category.lower()]
    return {"count": len(results), "products": results}


@app.get("/categories")
def list_categories() -> Dict[str, Any]:
    rag = get_rag()
    counts: Dict[str, int] = {}
    for record in rag.records:
        counts[record["category"]] = counts.get(record["category"], 0) + 1
    return {"categories": counts}


@app.post("/ask")
def ask(payload: Dict[str, Any], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    question = payload.get("question", "")
    persona = payload.get("template") or payload.get("persona", "shopper")
    if persona not in PERSONAS:
        raise HTTPException(status_code=400, detail="Invalid persona")
    if not question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    rag = get_rag()
    result = rag.answer(question, persona=persona)
    return result


@app.post("/wishlist")
def add_to_wishlist(payload: Dict[str, Any], authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user = require_user(authorization)
    name = payload.get("product_name", "")
    if not name:
        raise HTTPException(status_code=400, detail="product_name is required")
    conn = get_connection()
    conn.execute(
        "INSERT INTO wishlist (user_id, product_name, price, category) VALUES (?, ?, ?, ?)",
        (user["id"], name, payload.get("price"), payload.get("category")),
    )
    conn.commit()
    conn.close()
    return {"status": "added"}


@app.get("/wishlist")
def get_wishlist(authorization: Optional[str] = Header(default=None)) -> List[Dict[str, Any]]:
    user = require_user(authorization)
    conn = get_connection()
    rows = conn.execute("SELECT * FROM wishlist WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.delete("/wishlist/{item_id}")
def remove_from_wishlist(item_id: int, authorization: Optional[str] = Header(default=None)) -> Dict[str, str]:
    user = require_user(authorization)
    conn = get_connection()
    conn.execute("DELETE FROM wishlist WHERE id = ? AND user_id = ?", (item_id, user["id"]))
    conn.commit()
    conn.close()
    return {"status": "removed"}


@app.post("/upload")
async def upload(file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_user(authorization)
    import json

    content = await file.read()
    try:
        payload = json.loads(content.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    if isinstance(payload, dict):
        payload = [payload]
    if not isinstance(payload, list):
        raise HTTPException(status_code=400, detail="JSON must be a list or object")

    target_dir = DATA_DIR / file.filename.replace(".json", "")
    target_dir.mkdir(parents=True, exist_ok=True)
    out_path = target_dir / "custom.json"
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)

    get_rag(force_reload=True)
    return {"status": "uploaded", "path": str(out_path)}
