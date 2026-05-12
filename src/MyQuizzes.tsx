import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface QuizItem {
  id: string
  title: string
  publicId: string | null
  questionCount: number
  createdAt: string
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('lecture-ai-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function MyQuizzes() {
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState<QuizItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/quizzes`, { headers: authHeaders() })
        if (res.ok) setQuizzes(await res.json())
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handlePublish = useCallback(async (quizId: string) => {
    try {
      const res = await fetch(`${API_URL}/quizzes/${quizId}/publish`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const data = await res.json()
      if (data.publicId) {
        setQuizzes((prev) => prev.map((q) => q.id === quizId ? { ...q, publicId: data.publicId } : q))
      }
    } catch { /* ignore */ }
  }, [])

  const handleUnpublish = useCallback(async (quizId: string) => {
    try {
      await fetch(`${API_URL}/quizzes/${quizId}/unpublish`, {
        method: 'POST',
        headers: authHeaders(),
      })
      setQuizzes((prev) => prev.map((q) => q.id === quizId ? { ...q, publicId: null } : q))
    } catch { /* ignore */ }
  }, [])

  const handleDelete = useCallback(async (quizId: string) => {
    try {
      await fetch(`${API_URL}/quizzes/${quizId}`, { method: 'DELETE', headers: authHeaders() })
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId))
    } catch { /* ignore */ }
  }, [])

  const copyLink = useCallback((publicId: string) => {
    const url = `${window.location.origin}/take/${publicId}`
    navigator.clipboard.writeText(url)
    setCopiedId(publicId)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  if (loading) {
    return (
      <div className="quiz-creator">
        <h1>Мои квизы</h1>
        <div className="quiz-loading"><div className="spinner" /> Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="quiz-creator">
      <div className="quiz-list-header">
        <h1>Мои квизы</h1>
        <button className="quiz-generate-btn" onClick={() => navigate('/quiz/create')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Создать квиз
        </button>
      </div>

      {quizzes.length === 0 ? (
        <div className="quiz-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <p>У вас пока нет квизов</p>
          <button className="quiz-generate-btn" onClick={() => navigate('/quiz/create')}>Создать первый квиз</button>
        </div>
      ) : (
        <div className="quiz-list">
          {quizzes.map((q) => (
            <div key={q.id} className="quiz-list-item">
              <div className="quiz-list-info" onClick={() => navigate(`/quiz/edit/${q.id}`)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <div>
                  <span className="quiz-list-title">{q.title}</span>
                  <span className="quiz-list-meta">{q.questionCount} вопросов · {new Date(q.createdAt).toLocaleDateString('ru')}</span>
                </div>
              </div>
              <div className="quiz-list-actions">
                {q.publicId ? (
                  <>
                    <button
                      className="quiz-link-btn copied"
                      onClick={() => copyLink(q.publicId!)}
                      title="Копировать ссылку"
                    >
                      {copiedId === q.publicId ? (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> Скопировано</>
                      ) : (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Ссылка</>
                      )}
                    </button>
                    <button className="quiz-unpublish-btn" onClick={() => handleUnpublish(q.id)} title="Снять публикацию">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                    </button>
                  </>
                ) : (
                  <button className="quiz-publish-btn" onClick={() => handlePublish(q.id)} title="Опубликовать">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                    Опубликовать
                  </button>
                )}
                <button className="quiz-delete-btn" onClick={() => handleDelete(q.id)} title="Удалить">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
