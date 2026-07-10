import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, Heart, LayoutDashboard, MessageSquareText, Settings, ShoppingBag, Sparkles, Store, UploadCloud } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, Legend, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API_URL = '/api';

const PERSONA_LABELS = {
  shopper: 'Personal Shopper',
  dealhunter: 'Deal Hunter',
  stylist: 'Style Advisor',
};

const COLORS = ['#7c3aed', '#f97316', '#22c55e', '#0ea5e9', '#e11d48', '#eab308', '#14b8a6', '#8b5cf6'];

function App() {
  const [view, setView] = useState('login');
  const [token, setToken] = useState(localStorage.getItem('shopgenie-token') || '');
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: 'demo@shopgenie.ai', password: 'demo123' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState('shopper');
  const [chatId, setChatId] = useState(null);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [catalogQuery, setCatalogQuery] = useState('');
  const [wishlist, setWishlist] = useState([]);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const categoryChartData = useMemo(
    () => Object.entries(categories).map(([name, value]) => ({ name, value })),
    [categories]
  );

  const priceTrendData = [
    { month: 'Jan', avgSpend: 62, orders: 14 },
    { month: 'Feb', avgSpend: 68, orders: 18 },
    { month: 'Mar', avgSpend: 71, orders: 21 },
    { month: 'Apr', avgSpend: 75, orders: 25 },
    { month: 'May', avgSpend: 80, orders: 29 },
    { month: 'Jun', avgSpend: 84, orders: 33 },
  ];

  const satisfactionData = [
    { name: 'Loved it', value: 58 },
    { name: 'Kept it', value: 30 },
    { name: 'Returned', value: 12 },
  ];

  useEffect(() => {
    const loadSession = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/me`, { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setView('dashboard');
          loadChats();
          loadWishlist();
        } else {
          localStorage.removeItem('shopgenie-token');
          setToken('');
        }
      } catch {
        localStorage.removeItem('shopgenie-token');
      }
    };
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    loadTemplates();
    loadCategories();
    loadProducts();
  }, []);

  const loadChats = async () => {
    try {
      const res = await fetch(`${API_URL}/chats`, { headers: authHeaders });
      if (res.ok) setChats(await res.json());
    } catch {
      // ignore
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch {
      // ignore
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || {});
      }
    } catch {
      // ignore
    }
  };

  const loadProducts = async (q = '') => {
    try {
      const res = await fetch(`${API_URL}/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      // ignore
    }
  };

  const loadWishlist = async () => {
    try {
      const res = await fetch(`${API_URL}/wishlist`, { headers: authHeaders });
      if (res.ok) setWishlist(await res.json());
    } catch {
      // ignore
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      localStorage.setItem('shopgenie-token', data.token);
      setToken(data.token);
      setUser(data.user);
      setView('dashboard');
      await loadChats();
      await loadWishlist();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createConversation = async () => {
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ title: 'New shopping session' }),
      });
      const data = await res.json();
      if (res.ok) {
        setChatId(data.id);
        setMessages([]);
        setView('assistant');
        await loadChats();
      }
    } catch {
      setError('Unable to start a new session.');
    }
  };

  const openChat = async (id) => {
    setChatId(id);
    try {
      const res = await fetch(`${API_URL}/chat/${id}/messages`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((msg) => ({ role: msg.role, content: msg.content })));
      }
    } catch {
      setMessages([]);
    }
    setView('assistant');
  };

  const askQuestion = async () => {
    if (!question.trim() || !chatId) return;
    const userMessage = { role: 'user', content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ question, template }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'The assistant could not answer');
      const assistantMessage = { role: 'assistant', content: data.answer || 'No answer returned' };
      setMessages([...nextMessages, assistantMessage]);
      await fetch(`${API_URL}/chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ role: 'user', content: question }),
      });
      await fetch(`${API_URL}/chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ role: 'assistant', content: assistantMessage.content }),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setQuestion('');
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData, headers: authHeaders });
      const data = await res.json();
      setUploadMessage(`Uploaded ${file.name}: ${data.status}`);
      await loadCategories();
      await loadProducts();
    } catch {
      setUploadMessage('Upload failed.');
    }
  };

  const addToWishlist = async (product) => {
    try {
      await fetch(`${API_URL}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ product_name: product.name, price: product.price, category: product.category }),
      });
      await loadWishlist();
    } catch {
      // ignore
    }
  };

  const removeFromWishlist = async (id) => {
    try {
      await fetch(`${API_URL}/wishlist/${id}`, { method: 'DELETE', headers: authHeaders });
      await loadWishlist();
    } catch {
      // ignore
    }
  };

  const logout = () => {
    localStorage.removeItem('shopgenie-token');
    setToken('');
    setUser(null);
    setView('login');
  };

  const navButton = (key, label, Icon, marginBottom = 10) => (
    <button
      onClick={() => setView(key)}
      style={{
        width: '100%', padding: 12, borderRadius: 10,
        background: view === key ? '#f5f3ff' : 'white',
        border: view === key ? '1px solid #c4b5fd' : '1px solid #e2e8f0',
        color: '#1e1b2e', marginBottom, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <Icon size={16} /> {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#faf9fc', color: '#1e1b2e', fontFamily: 'Inter, Arial, sans-serif' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24 }}>
        {!user ? (
          <div style={{ maxWidth: 480, margin: '80px auto', padding: 32, borderRadius: 24, background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 18px 45px rgba(30, 27, 46, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <ShoppingBag size={24} color="#7c3aed" />
              <h2 style={{ margin: 0 }}>ShopGenie AI</h2>
            </div>
            <p style={{ color: '#64748b', marginBottom: 24 }}>Sign in to get AI-powered product recommendations, deal hunting, and style advice tailored to you.</p>
            <form onSubmit={handleLogin}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Email</label>
              <input value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} style={{ width: '100%', padding: 12, borderRadius: 10, marginBottom: 12, border: '1px solid #cbd5e1', background: '#f8fafc' }} />
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Password</label>
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={{ width: '100%', padding: 12, borderRadius: 10, marginBottom: 16, border: '1px solid #cbd5e1', background: '#f8fafc' }} />
              {error && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}
              <button type="submit" disabled={loading} style={{ width: '100%', padding: 12, borderRadius: 10, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', color: 'white', border: 'none', cursor: 'pointer' }}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16 }}>Demo credentials are pre-filled — just click sign in.</p>
          </div>
        ) : (
          <>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, background: 'white', padding: 20, borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 10px 28px rgba(30, 27, 46, 0.05)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Sparkles size={20} color="#7c3aed" />
                  <h1 style={{ margin: 0, fontSize: 24 }}>ShopGenie Console</h1>
                </div>
                <p style={{ margin: 0, color: '#64748b' }}>AI-assisted shopping: discover products, compare deals, and get style guidance in one workspace.</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{user.full_name}</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>{user.role}</div>
                <button onClick={logout} style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e1b2e', cursor: 'pointer' }}>Logout</button>
              </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
              <aside style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 20, padding: 16, minHeight: 760, boxShadow: '0 10px 28px rgba(30, 27, 46, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <LayoutDashboard size={18} color="#7c3aed" />
                  <h3 style={{ margin: 0 }}>Workspace</h3>
                </div>
                {navButton('dashboard', 'Dashboard', LayoutDashboard)}
                {navButton('assistant', 'Assistant', Bot)}
                {navButton('catalog', 'Catalog', Store)}
                {navButton('wishlist', 'Wishlist', Heart)}
                {navButton('settings', 'Settings', Settings, 24)}

                <div style={{ marginBottom: 12, color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Categories</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {Object.keys(categories).slice(0, 5).map((cat) => (
                    <div key={cat} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13 }}>{cat} · {categories[cat]}</div>
                  ))}
                </div>

                <div style={{ marginTop: 8, marginBottom: 10, color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Recent Sessions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {chats.map((chat) => (
                    <button key={chat.id} onClick={() => openChat(chat.id)} style={{ textAlign: 'left', padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e1b2e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MessageSquareText size={14} color="#64748b" /> {chat.title}
                    </button>
                  ))}
                </div>
              </aside>

              <main style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, minHeight: 760, boxShadow: '0 10px 28px rgba(30, 27, 46, 0.05)' }}>
                {view === 'dashboard' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Shopping Overview</h3>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>A snapshot of catalog breadth, spending trends, and satisfaction.</p>
                      </div>
                      <button onClick={createConversation} style={{ padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={16}/> New session</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
                      {[
                        { label: 'Catalog size', value: String(products.length || 200), sub: 'Products indexed' },
                        { label: 'Avg. order value', value: '$84', sub: '+5% vs last month' },
                        { label: 'Categories', value: String(Object.keys(categories).length || 8), sub: 'Across the catalog' },
                        { label: 'Wishlist items', value: String(wishlist.length), sub: 'Saved for later' },
                      ].map((card) => (
                        <div key={card.label} style={{ padding: 16, borderRadius: 14, background: '#faf9fc', border: '1px solid #e2e8f0' }}>
                          <div style={{ color: '#64748b', fontSize: 13 }}>{card.label}</div>
                          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{card.value}</div>
                          <div style={{ color: '#7c3aed', fontSize: 12, marginTop: 4 }}>{card.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr', gap: 16, marginBottom: 16 }}>
                      <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>Spending trend</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={priceTrendData}>
                            <CartesianGrid stroke="#e2e8f0" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="avgSpend" stackId="1" stroke="#7c3aed" fill="#ddd6fe" name="Avg spend ($)" />
                            <Area type="monotone" dataKey="orders" stackId="2" stroke="#f97316" fill="#fed7aa" name="Orders" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>Purchase satisfaction</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={satisfactionData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} fill="#7c3aed">
                              {satisfactionData.map((entry, index) => <Cell key={entry.name} fill={['#7c3aed', '#22c55e', '#f97316'][index % 3]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>Products by category</div>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={categoryChartData}>
                          <CartesianGrid stroke="#e2e8f0" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {categoryChartData.map((entry, index) => (
                              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {view === 'assistant' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ margin: 0 }}>AI Shopping Assistant</h3>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>Retrieval-grounded recommendations from the live product catalog.</p>
                      </div>
                      <select value={template} onChange={(e) => setTemplate(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }}>
                        {templates.map((item) => <option key={item} value={item}>{PERSONA_LABELS[item] || item}</option>)}
                      </select>
                    </div>
                    {!chatId && <div style={{ color: '#64748b', marginBottom: 12 }}>Start a new session from the Dashboard to begin chatting.</div>}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                      {messages.length === 0 && <div style={{ color: '#64748b' }}>Ask about electronics, fashion, home, beauty, sports, books, toys, or grocery — mention a budget for tighter picks.</div>}
                      {messages.map((msg, index) => (
                        <div key={index} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                          <div style={{ padding: '12px 14px', borderRadius: 14, background: msg.role === 'user' ? '#7c3aed' : '#f8fafc', color: msg.role === 'user' ? 'white' : '#1e1b2e', border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none', whiteSpace: 'pre-wrap' }}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {loading && <div style={{ color: '#64748b' }}>Thinking...</div>}
                    </div>
                    {error && <div style={{ color: '#dc2626', marginBottom: 10 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. 'wireless headphones under $100' or 'a warm winter outfit for hiking'" style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc' }} />
                      <button onClick={askQuestion} disabled={loading || !chatId} style={{ padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', color: 'white', border: 'none', cursor: 'pointer' }}>
                        {loading ? 'Working...' : 'Ask'}
                      </button>
                    </div>
                  </div>
                )}

                {view === 'catalog' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Product Catalog</h3>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>Browse or search the live catalog used by the assistant.</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={catalogQuery} onChange={(e) => setCatalogQuery(e.target.value)} placeholder="Search products..." style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
                        <button onClick={() => loadProducts(catalogQuery)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>Search</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                      {products.map((p, idx) => (
                        <div key={idx} style={{ padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff' }}>
                          <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>{p.category}</div>
                          <div style={{ fontWeight: 700, margin: '4px 0' }}>{p.name}</div>
                          <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>{p.brand} · {p.rating}/5 ★</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700 }}>${p.price?.toFixed ? p.price.toFixed(2) : p.price}</div>
                            <button onClick={() => addToWishlist(p)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#faf9fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Heart size={14} color="#7c3aed" /> Save
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {view === 'wishlist' && (
                  <div>
                    <h3 style={{ marginTop: 0 }}>Your Wishlist</h3>
                    <p style={{ color: '#64748b' }}>Products you've saved from the catalog or assistant recommendations.</p>
                    {wishlist.length === 0 && <div style={{ color: '#64748b' }}>Nothing saved yet — browse the catalog and hit "Save".</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {wishlist.map((item) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{item.product_name}</div>
                            <div style={{ color: '#64748b', fontSize: 13 }}>{item.category} · ${item.price}</div>
                          </div>
                          <button onClick={() => removeFromWishlist(item.id)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#faf9fc', cursor: 'pointer' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {view === 'settings' && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <h3 style={{ margin: 0 }}>Application Settings</h3>
                      <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>Configure your workspace preferences and integration settings.</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>Profile</div>
                        <div style={{ color: '#64748b', marginBottom: 12 }}>Manage your account details and role settings.</div>
                        <div style={{ marginBottom: 8 }}><strong>Email:</strong> {user.email}</div>
                        <div style={{ marginBottom: 8 }}><strong>Full name:</strong> {user.full_name}</div>
                        <div><strong>Role:</strong> {user.role}</div>
                      </div>
                      <div style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>OpenAI Configuration</div>
                        <div style={{ color: '#64748b', marginBottom: 12 }}>The assistant uses the server-side OpenAI key for secure model generation.</div>
                        <div style={{ padding: 12, borderRadius: 12, background: '#faf9fc', border: '1px solid #e2e8f0' }}>Server-side env: <code>OPENAI_API_KEY</code></div>
                      </div>
                    </div>
                    <div style={{ marginTop: 20, padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: '#faf9fc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <UploadCloud size={18} color="#7c3aed" />
                        <div style={{ fontWeight: 700 }}>Upload a custom catalog</div>
                      </div>
                      <div style={{ color: '#64748b', marginBottom: 12 }}>Upload a JSON file of products (name, category, price, rating, description, features) to extend the assistant's knowledge base.</div>
                      <input type="file" accept=".json" onChange={handleUpload} />
                      {uploadMessage && <p style={{ color: '#7c3aed', marginTop: 10 }}>{uploadMessage}</p>}
                    </div>
                  </div>
                )}
              </main>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
