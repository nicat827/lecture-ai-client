import { useState, useRef, useCallback, useEffect } from 'react'
import Markdown from 'react-markdown'
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

function createSession(): Session {
  return {
    id: crypto.randomUUID(),
    title: 'Новый чат',
    messages: [],
    createdAt: Date.now(),
  }
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem('lecture-ai-sessions')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem('lecture-ai-sessions', JSON.stringify(sessions))
}

function loadActiveId(): string | null {
  return localStorage.getItem('lecture-ai-active')
}

function saveActiveId(id: string) {
  localStorage.setItem('lecture-ai-active', id)
}

function App() {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId())
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

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  useEffect(() => {
    if (activeId) saveActiveId(activeId)
  }, [activeId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startNewSession = useCallback(() => {
    const s = createSession()
    setSessions((prev) => [s, ...prev])
    setActiveId(s.id)
    setInput('')
    setUploadedDocs([])
  }, [])

  const switchSession = useCallback((id: string) => {
    setActiveId(id)
    setInput('')
    setUploadedDocs([])
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeId === id) {
      const remaining = sessions.filter((s) => s.id !== id)
      setActiveId(remaining.length > 0 ? remaining[0].id : null)
    }
  }, [activeId, sessions])

  const generateSessionTitle = useCallback(async (sessionId: string, firstMessage: string) => {
    try {
      const res = await fetch(`${API_URL}/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: firstMessage }),
      })
      const data = await res.json()
      if (data.title) {
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
      const s = createSession()
      setSessions((prev) => [s, ...prev])
      setActiveId(s.id)
      currentSessionId = s.id
    }

    const isFirstMessage = (sessions.find((s) => s.id === currentSessionId)?.messages.length ?? 0) === 0

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      text: trimmed,
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
    const docsToSend = [...uploadedDocs]
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
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

        <button className="new-chat-btn" onClick={startNewSession}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Новый чат
        </button>

        <div className="sessions-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${s.id === activeId ? 'active' : ''}`}
              onClick={() => switchSession(s.id)}
            >
              <svg className="session-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span className="session-title">{s.title}</span>
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span>created by <strong>685r1</strong></span>
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
      </div>
    </div>
  )
}

export default App
