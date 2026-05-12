import { useState, useRef, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface UploadedDoc {
  filename: string
  size: number
  textLength: number
  text: string
}

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

interface GeneratedQuiz {
  id: string
  title: string
  questions: QuizQuestion[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('lecture-ai-token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function QuizCreator() {
  const [uploadedDoc, setUploadedDoc] = useState<UploadedDoc | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [questionCount, setQuestionCount] = useState(5)
  const [optionCount, setOptionCount] = useState(4)
  const [title, setTitle] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null)
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setUploadedDoc(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!uploadedDoc) return
    setIsGenerating(true)
    setError('')
    setQuiz(null)
    setSaved(false)
    try {
      const res = await fetch(`${API_URL}/quizzes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          documentText: uploadedDoc.text,
          questionCount,
          optionCount,
          title: title.trim() || uploadedDoc.filename,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации')
      // Re-fetch the full quiz with proper IDs
      const fullRes = await fetch(`${API_URL}/quizzes/${data.id}`, { headers: authHeaders() })
      const fullData = await fullRes.json()
      setQuiz(fullData)
      setSaved(true) // It's already saved on generation
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации')
    } finally {
      setIsGenerating(false)
    }
  }, [uploadedDoc, questionCount, optionCount, title])

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
    try {
      await fetch(`${API_URL}/quizzes/${quiz.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      setQuiz(null)
      setUploadedDoc(null)
      setTitle('')
      setSaved(false)
    } catch { /* ignore */ }
  }, [quiz])

  return (
    <div className="quiz-creator">
      <h1>Создать квиз</h1>

      {!quiz ? (
        <div className="quiz-setup">
          {/* File upload */}
          <div className="quiz-section">
            <label className="quiz-label">Документ</label>
            {uploadedDoc ? (
              <div className="quiz-doc-card">
                <div className="quiz-doc-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div className="quiz-doc-info">
                  <span className="quiz-doc-name">{uploadedDoc.filename}</span>
                  <span className="quiz-doc-meta">{formatSize(uploadedDoc.size)} · {uploadedDoc.textLength.toLocaleString()} симв.</span>
                </div>
                <button className="quiz-doc-remove" onClick={() => setUploadedDoc(null)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ) : (
              <button
                className="quiz-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <><div className="spinner" /> Загрузка...</>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    Загрузить документ
                  </>
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={handleFileUpload}
              hidden
            />
          </div>

          {/* Settings */}
          <div className="quiz-section">
            <label className="quiz-label">Название квиза</label>
            <input
              className="quiz-input"
              placeholder={uploadedDoc?.filename || 'Название...'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="quiz-row">
            <div className="quiz-section quiz-section-half">
              <label className="quiz-label">Кол-во вопросов</label>
              <select className="quiz-select" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                {[3, 5, 7, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="quiz-section quiz-section-half">
              <label className="quiz-label">Вариантов ответа</label>
              <select className="quiz-select" value={optionCount} onChange={(e) => setOptionCount(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div className="quiz-error">{error}</div>}

          <button
            className="quiz-generate-btn"
            onClick={handleGenerate}
            disabled={!uploadedDoc || isGenerating}
          >
            {isGenerating ? (
              <><div className="spinner" /> Генерирую квиз...</>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Сгенерировать
              </>
            )}
          </button>
        </div>
      ) : (
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
            {saved && (
              <span className="quiz-saved-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                Сохранено
              </span>
            )}
          </div>
        </div>
      )}
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
