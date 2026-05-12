import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface QuizOption {
  id: number
  text: string
  isCorrect: boolean
}

interface QuizQuestion {
  id: number
  question: string
  options: QuizOption[]
}

interface QuizData {
  id: string
  title: string
  publicId: string | null
  questions: QuizQuestion[]
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('lecture-ai-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function QuizEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/quizzes/${id}`, { headers: authHeaders() })
        if (res.ok) setQuiz(await res.json())
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [id])

  const handleUpdateQuestion = useCallback(async (questionId: number, question: string, options: QuizOption[]) => {
    if (!quiz) return
    try {
      await fetch(`${API_URL}/quizzes/${quiz.id}/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question, options }),
      })
      setQuiz((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          questions: prev.questions.map((q) =>
            q.id === questionId ? { ...q, question, options } : q
          ),
        }
      })
      setEditingQuestion(null)
    } catch { /* ignore */ }
  }, [quiz])

  const handleDelete = useCallback(async () => {
    if (!quiz) return
    await fetch(`${API_URL}/quizzes/${quiz.id}`, { method: 'DELETE', headers: authHeaders() })
    navigate('/quiz/my')
  }, [quiz, navigate])

  if (loading) {
    return (
      <div className="quiz-creator">
        <div className="quiz-loading"><div className="spinner" /> Загрузка...</div>
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="quiz-creator">
        <div className="quiz-error">Квиз не найден</div>
      </div>
    )
  }

  return (
    <div className="quiz-creator">
      <button className="quiz-back-btn" onClick={() => navigate('/quiz/my')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        Назад
      </button>

      <div className="quiz-preview">
        <div className="quiz-preview-header">
          <h2>{quiz.title}</h2>
          <span className="quiz-badge">{quiz.questions.length} вопросов</span>
        </div>

        <div className="quiz-questions">
          {quiz.questions.map((q, qi) => (
            <QuestionCard
              key={q.id}
              index={qi}
              question={q}
              isEditing={editingQuestion === q.id}
              onEdit={() => setEditingQuestion(q.id)}
              onSave={(question, options) => handleUpdateQuestion(q.id, question, options)}
              onCancel={() => setEditingQuestion(null)}
            />
          ))}
        </div>

        <div className="quiz-actions">
          <button className="quiz-action-btn quiz-action-delete" onClick={handleDelete}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionCard({
  index, question, isEditing, onEdit, onSave, onCancel,
}: {
  index: number
  question: QuizQuestion
  isEditing: boolean
  onEdit: () => void
  onSave: (question: string, options: QuizOption[]) => void
  onCancel: () => void
}) {
  const [editQ, setEditQ] = useState(question.question)
  const [editOpts, setEditOpts] = useState(question.options)

  const startEdit = () => {
    setEditQ(question.question)
    setEditOpts(question.options)
    onEdit()
  }

  if (isEditing) {
    return (
      <div className="quiz-question-card editing">
        <div className="quiz-q-number">{index + 1}</div>
        <div className="quiz-q-content">
          <textarea
            className="quiz-q-edit-input"
            value={editQ}
            onChange={(e) => setEditQ(e.target.value)}
            rows={2}
          />
          <div className="quiz-q-options">
            {editOpts.map((opt, oi) => (
              <div key={opt.id} className="quiz-q-option-edit">
                <button
                  className={`quiz-q-radio ${opt.isCorrect ? 'correct' : ''}`}
                  onClick={() => setEditOpts((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === oi })))}
                />
                <input
                  className="quiz-q-opt-input"
                  value={opt.text}
                  onChange={(e) => setEditOpts((prev) => prev.map((o, i) => i === oi ? { ...o, text: e.target.value } : o))}
                />
              </div>
            ))}
          </div>
          <div className="quiz-q-edit-actions">
            <button className="quiz-q-save-btn" onClick={() => onSave(editQ, editOpts)}>Сохранить</button>
            <button className="quiz-q-cancel-btn" onClick={onCancel}>Отмена</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quiz-question-card">
      <div className="quiz-q-number">{index + 1}</div>
      <div className="quiz-q-content">
        <p className="quiz-q-text">{question.question}</p>
        <div className="quiz-q-options">
          {question.options.map((opt) => (
            <div key={opt.id} className={`quiz-q-option ${opt.isCorrect ? 'correct' : ''}`}>
              <span className={`quiz-q-dot ${opt.isCorrect ? 'correct' : ''}`} />
              <span>{opt.text}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="quiz-q-edit-btn" onClick={startEdit}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>
  )
}
