import json
from io import StringIO
from pathlib import Path

import streamlit as st

from src.shopping_rag import ShoppingRAG, build_demo_dataset


DATA_DIR = Path("data/products")


@st.cache_resource
def load_rag():
    if not DATA_DIR.exists() or not any(DATA_DIR.glob("*.json")):
        build_demo_dataset(DATA_DIR, count=200)
    return ShoppingRAG(DATA_DIR, top_k=5)


st.set_page_config(page_title="GenAI Shopping Assistant", page_icon="🛍️")
st.markdown(
    """
    <style>
    .stApp { background: linear-gradient(135deg, #0f172a, #1e293b); color: white; }
    .block-container { padding-top: 1.3rem; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("🛍️ GenAI Shopping Assistant")
st.caption("Describe what you're looking for and get personalized product recommendations grounded in the catalog.")

rag = load_rag()

PERSONAS = {
    "shopper": "Personal Shopper",
    "dealhunter": "Deal Hunter",
    "stylist": "Style Advisor",
}

if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": "Hi! Tell me what you're shopping for — electronics, fashion, home, beauty, sports, books, toys, or grocery — and any budget in mind.",
        }
    ]

with st.sidebar:
    st.header("Catalog")
    st.write(f"Loaded {len(rag.records)} products")
    persona_label = st.selectbox("Assistant persona", list(PERSONAS.values()))
    persona = [k for k, v in PERSONAS.items() if v == persona_label][0]

    st.write("Upload your own product catalog as JSON, or refresh the demo catalog.")
    uploaded_file = st.file_uploader("Upload product JSON", type=["json"])
    if uploaded_file is not None:
        try:
            payload = json.load(StringIO(uploaded_file.getvalue().decode("utf-8")))
            if isinstance(payload, dict):
                payload = [payload]
            if not payload:
                st.error("The uploaded file contains no records.")
            else:
                rag = ShoppingRAG(records=payload, top_k=5)
                st.success(f"Loaded {len(rag.records)} products from {uploaded_file.name}")
        except Exception as exc:
            st.error(f"Upload failed: {exc}")

    if st.button("Refresh demo catalog"):
        build_demo_dataset(DATA_DIR, count=200)
        st.cache_resource.clear()
        st.rerun()

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

prompt = st.chat_input("Ask for a product recommendation, e.g. 'wireless headphones under $100'")
if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Searching the catalog..."):
            result = rag.answer(prompt, persona=persona)
        st.markdown(result["answer"])
        if result.get("products"):
            with st.expander("Matched products"):
                for product in result["products"]:
                    st.write(f"- **{product['name']}** — ${product['price']:.2f} · {product['rating']}/5 ({product['category']})")

    st.session_state.messages.append({"role": "assistant", "content": result["answer"]})
