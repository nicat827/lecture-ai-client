import { useState, useRef, useCallback, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Markdown from 'react-markdown'
import QuizCreator from './QuizCreator'
import MyQuizzes from './MyQuizzes'
import QuizEdit from './QuizEdit'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  files?: { name: string; size: number }[]
  loading?: boolean
}

interface UploadedDoc {
  filename: string
  size: number
  textLength: number
  text: string
}

interface Session {
  id: string
  title: string
  messages: Message[]
  createdAt: number
}

interface AuthUser {
  id: number
  email: string
}

const HINTS = [
  { icon: 'doc', label: 'Загрузи лекцию', desc: 'и получи краткое содержание' },
  { icon: 'question', label: 'Задай вопрос', desc: 'по материалу документа' },
  { icon: 'list', label: 'Ключевые тезисы', desc: 'выдели главное из текста' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
}

function getToken(): string | null {
  return localStorage.getItem('lecture-ai-token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/* ---- Auth Screen Component ---- */
function AuthScreen({ onAuth }: { onAuth: (user: AuthUser, token: string) => void }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register'
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Ошибка')
        return
      }
      localStorage.setItem('lecture-ai-token', data.token)
      localStorage.setItem('lecture-ai-user', JSON.stringify(data.user))
      onAuth(data.user, data.token)
    } catch {
      setError('Ошибка соединения с сервером')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <span>LectureAI</span>
        </div>
        <h2>{isLogin ? 'Вход' : 'Регистрация'}</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="auth-input"
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Загрузка...' : isLogin ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        <button className="auth-switch" onClick={() => { setIsLogin(!isLogin); setError('') }}>
          {isLogin ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
        </button>
      </div>
    </div>
  )
}

/* ---- Main App Component ---- */
function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem('lecture-ai-user')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [token, setToken] = useState<string | null>(() => getToken())

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const activeSession = sessions.find((s) => s.id === activeId) ?? null
  const messages = activeSession?.messages ?? []

  const [input, setInput] = useState('')
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load sessions from API on login
  const fetchSessions = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/sessions`, { headers: authHeaders() })
      if (res.status === 401) { handleLogout(); return }
      const data = await res.json()
      setSessions(data.map((s: any) => ({ ...s, messages: [], createdAt: new Date(s.createdAt).getTime() })))
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    if (user && token) fetchSessions()
  }, [user, token, fetchSessions])

  // Load messages when switching session
  useEffect(() => {
    if (!activeId || !token) return
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const loadMessages = async () => {
      try {
        const res = await fetch(`${API_URL}/sessions/${activeId}/messages`, { headers: authHeaders() })
        if (!res.ok) return
        const data = await res.json()
        const msgs = data.messages.map((m: any) => ({ id: m.id, role: m.role, text: m.text, files: m.files }))

        if (data.pending) {
          // Show loader while server is still generating
          const hasLoader = msgs.some((m: any) => m.role === 'assistant' && m.loading)
          if (!hasLoader) {
            msgs.push({ id: Date.now(), role: 'assistant', text: 'Генерирую ответ...', loading: true })
          }
          pollTimer = setTimeout(() => loadMessages(true), 2000)
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeId
              ? { ...s, messages: msgs }
              : s
          )
        )
      } catch { /* ignore */ }
    }
    // Only load if messages are empty (haven't been loaded yet) or if polling
    const session = sessions.find((s) => s.id === activeId)
    if (session && session.messages.length === 0) {
      loadMessages()
    }

    return () => {
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [activeId, token])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('lecture-ai-token')
    localStorage.removeItem('lecture-ai-user')
    setUser(null)
    setToken(null)
    setSessions([])
    setActiveId(null)
  }, [])

  const handleAuth = useCallback((u: AuthUser, t: string) => {
    setUser(u)
    setToken(t)
  }, [])

  const startNewSession = useCallback(async () => {
    const id = crypto.randomUUID()
    const title = 'Новый чат'
    try {
      await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id, title }),
      })
    } catch { /* ignore */ }
    const s: Session = { id, title, messages: [], createdAt: Date.now() }
    setSessions((prev) => [s, ...prev])
    setActiveId(id)
    setInput('')
    setUploadedDocs([])
  }, [])

  const switchSession = useCallback((id: string) => {
    setActiveId(id)
    setInput('')
    setUploadedDocs([])
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    try {
      await fetch(`${API_URL}/sessions/${id}`, { method: 'DELETE', headers: authHeaders() })
    } catch { /* ignore */ }
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      const remaining = sessions.filter((s) => s.id !== id)
      setActiveId(remaining.length > 0 ? remaining[0].id : null)
    }
  }, [activeId, sessions])

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const startRenaming = useCallback((id: string, currentTitle: string) => {
    setEditingSessionId(id)
    setEditingTitle(currentTitle)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [])

  const commitRename = useCallback(async () => {
    if (!editingSessionId) return
    const trimmed = editingTitle.trim()
    if (!trimmed) {
      setEditingSessionId(null)
      return
    }
    try {
      await fetch(`${API_URL}/sessions/${editingSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ title: trimmed }),
      })
    } catch { /* ignore */ }
    setSessions((prev) =>
      prev.map((s) => (s.id === editingSessionId ? { ...s, title: trimmed } : s))
    )
    setEditingSessionId(null)
  }, [editingSessionId, editingTitle])

  const cancelRename = useCallback(() => {
    setEditingSessionId(null)
  }, [])

  const generateSessionTitle = useCallback(async (sessionId: string, firstMessage: string) => {
    try {
      const res = await fetch(`${API_URL}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message: firstMessage }),
      })
      const data = await res.json()
      if (data.title) {
        // Update in API
        await fetch(`${API_URL}/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ title: data.title }),
        })
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: data.title } : s))
        )
      }
    } catch { /* ignore */ }
  }, [])

  const uploadFile = useCallback(async (file: File): Promise<UploadedDoc> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
    return data as UploadedDoc
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileList = Array.from(files)
    e.target.value = ''

    setIsUploading(true)
    for (const file of fileList) {
      try {
        const doc = await uploadFile(file)
        setUploadedDocs((prev) => [...prev, doc])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка'
        alert(`Не удалось загрузить "${file.name}": ${msg}`)
      }
    }
    setIsUploading(false)
  }, [uploadFile])

  const removeDoc = (index: number) => {
    setUploadedDocs((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed && uploadedDocs.length === 0) return
    if (isLoading) return

    // Auto-create session if none active
    let currentSessionId = activeId
    if (!currentSessionId) {
      const id = crypto.randomUUID()
      const title = 'Новый чат'
      try {
        await fetch(`${API_URL}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ id, title }),
        })
      } catch { /* ignore */ }
      const s: Session = { id, title, messages: [], createdAt: Date.now() }
      setSessions((prev) => [s, ...prev])
      setActiveId(id)
      currentSessionId = id
    }

    const isFirstMessage = (sessions.find((s) => s.id === currentSessionId)?.messages.length ?? 0) === 0

    const docsToSend = [...uploadedDocs]
    const displayText = trimmed || (docsToSend.length > 0 ? docsToSend.map((d) => d.filename).join(', ') : '')

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      text: displayText,
      files: uploadedDocs.map((d) => ({ name: d.filename, size: d.size })),
    }

    const loadingMsg: Message = {
      id: Date.now() + 1,
      role: 'assistant',
      text: 'Анализирую...',
      loading: true,
    }

    const updateMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: typeof updater === 'function' ? updater(s.messages) : updater }
            : s
        )
      )
    }

    updateMessages((prev) => [...prev, userMsg, loadingMsg])
    setInput('')
    setUploadedDocs([])
    setIsLoading(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Generate title for first message
    if (isFirstMessage) {
      generateSessionTitle(currentSessionId, trimmed || uploadedDocs.map((d) => d.filename).join(', '))
    }

    try {
      let message = trimmed

      if (docsToSend.length > 0) {
        const docTexts = docsToSend
          .map((d) => `--- Файл: ${d.filename} ---\n${d.text}`)
          .join('\n\n')
        message = `${trimmed || 'Сделай краткое содержание этой лекции.'}\n\n${docTexts}`
      }

      const chatRes = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message, displayText, sessionId: currentSessionId, files: docsToSend.map((d) => ({ name: d.filename, size: d.size })) }),
      })

      if (!chatRes.ok) {
        const text = await chatRes.text()
        let errorMsg = 'Ошибка сервера'
        try { errorMsg = JSON.parse(text).error || errorMsg } catch { /* ignore */ }
        throw new Error(errorMsg)
      }

      const reader = chatRes.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      reading: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue
          const data = trimmedLine.slice(6)
          if (data === '[DONE]') break reading
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.content) {
              fullText += parsed.content
              const text = fullText
              updateMessages((prev) =>
                prev.map((m) =>
                  m.id === loadingMsg.id
                    ? { ...m, text, loading: false }
                    : m
                )
              )
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Ошибка соединения'
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? { ...m, text: `Ошибка: ${errorText}`, loading: false }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [input, uploadedDocs, isLoading, activeId, sessions, generateSessionTitle])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const hasMessages = messages.length > 0

  if (!user || !token) {
    return <AuthScreen onAuth={handleAuth} />
  }

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span>LectureAI</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => { startNewSession(); navigate('/') }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Новый чат
        </button>

        <div className="sidebar-nav">
          <button className={`sidebar-nav-btn ${location.pathname === '/quiz/create' ? 'active' : ''}`} onClick={() => navigate('/quiz/create')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Создать квиз
          </button>
          <button className={`sidebar-nav-btn ${location.pathname === '/quiz/my' ? 'active' : ''}`} onClick={() => navigate('/quiz/my')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Мои квизы
          </button>
        </div>

        <div className="sessions-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${s.id === activeId ? 'active' : ''}`}
              onClick={() => { switchSession(s.id); navigate('/') }}
            >
              <svg className="session-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {editingSessionId === s.id ? (
                <input
                  ref={editInputRef}
                  className="session-title-input"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="session-title" onDoubleClick={(e) => { e.stopPropagation(); startRenaming(s.id, s.title) }}>{s.title}</span>
              )}
              <button
                className="session-rename"
                onClick={(e) => { e.stopPropagation(); startRenaming(s.id, s.title) }}
                aria-label="Rename session"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button
                className="session-delete"
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                aria-label="Delete session"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="sidebar-email">{user.email}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout} aria-label="Logout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="app">
        <header className="topbar">
          {!sidebarOpen && (
            <>
              <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
              <div className="topbar-logo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <span>LectureAI</span>
              </div>
            </>
          )}
        </header>

        <Routes>
          <Route path="/quiz/create" element={<main className="main quiz-page-main"><QuizCreator /></main>} />
          <Route path="/quiz/my" element={<main className="main quiz-page-main"><MyQuizzes /></main>} />
          <Route path="/quiz/edit/:id" element={<main className="main quiz-page-main"><QuizEdit /></main>} />
          <Route path="*" element={
            <>
              <main className="main">
                {!hasMessages && (
                  <div className="welcome">
                    <div className="welcome-badge">Анализ лекций с ИИ</div>
                    <h1>Чем могу помочь?</h1>
                    <p className="welcome-sub">
                      Загрузите документ с лекцией — я создам краткое содержание, выделю ключевые тезисы или отвечу на вопросы по материалу
                    </p>
                    <div className="hints">
                      {HINTS.map((h) => (
                        <button key={h.label} className="hint-card" onClick={() => setInput(h.label + ': ')}>
                          <div className="hint-icon">
                            {h.icon === 'doc' && (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      )}
                      {h.icon === 'question' && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      )}
                      {h.icon === 'list' && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      )}
                    </div>
                    <div className="hint-text">
                      <span className="hint-label">{h.label}</span>
                      <span className="hint-desc">{h.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasMessages && (
            <div className="messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="avatar avatar-ai">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    </div>
                  )}
                  <div className={`message-bubble ${msg.loading ? 'loading' : ''}`}>
                    {msg.files && msg.files.length > 0 && (
                      <div className="message-files">
                        {msg.files.map((f, i) => (
                          <span key={i} className="file-badge">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            {f.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' ? (
                      <Markdown>{msg.text}</Markdown>
                    ) : (
                      <p>{msg.text}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        <div className={`input-area ${hasMessages ? 'has-messages' : ''}`}>
          <div className="input-container">
            {(uploadedDocs.length > 0 || isUploading) && (
              <div className="input-docs">
                {uploadedDocs.map((doc, i) => (
                  <div key={i} className="context-doc">
                    <div className="context-doc-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div className="context-doc-info">
                      <span className="context-doc-name">{doc.filename}</span>
                      <span className="context-doc-meta">{formatSize(doc.size)} · {doc.textLength.toLocaleString()} симв.</span>
                    </div>
                    <button className="context-doc-remove" onClick={() => removeDoc(i)} aria-label="Remove">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
                {isUploading && (
                  <div className="context-doc uploading">
                    <div className="spinner" />
                    <span className="context-doc-name">Загружаю...</span>
                  </div>
                )}
              </div>
            )}
            <div className="input-row">
              <button className="attach-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading} aria-label="Attach file">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                onChange={handleFileChange}
                hidden
              />
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Опишите задачу или прикрепите лекцию..."
                rows={1}
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={isLoading || isUploading || (!input.trim() && uploadedDocs.length === 0)}
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </div>
          <span className="input-hint">LectureAI может допускать ошибки. Проверяйте важную информацию.</span>
        </div>
            </>
          } />
        </Routes>
      </div>
    </div>
  )
}

export default App
