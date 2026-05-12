import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface Option {
  id: number
  text: string
}

interface Question {
  id: number
  question: string
  options: Option[]
}

interface QuizData {
  title: string
  questions: Question[]
}

interface SubmitResult {
  total: number
  correct: number
  score: number
  results: { questionId: number; selectedId: number; correctId: number; isCorrect: boolean }[]
}

export default function PublicQuiz() {
  const { publicId } = useParams<{ publicId: string }>()
  const [quiz, setQuiz] = useState<QuizData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/public/quiz/${publicId}`)
        if (!res.ok) {
          setError('Квиз не найден')
          return
        }
        setQuiz(await res.json())
      } catch {
        setError('Ошибка загрузки')
      } finally {
        setLoading(false)
      }
    })()
  }, [publicId])

  const handleSelect = (questionId: number, optionId: number) => {
    if (result) return
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const handleSubmit = async () => {
    if (!quiz) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/public/quiz/${publicId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch {
      setError('Ошибка отправки')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = () => {
    setAnswers({})
    setResult(null)
    setStarted(false)
  }

  if (loading) {
    return (
      <div className="public-quiz">
        <div className="public-quiz-card">
          <div className="quiz-loading"><div className="spinner" /> Загрузка квиза...</div>
        </div>
      </div>
    )
  }

  if (error || !quiz) {
    return (
      <div className="public-quiz">
        <div className="public-quiz-card">
          <div className="quiz-error">{error || 'Квиз не найден'}</div>
        </div>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="public-quiz">
        <div className="public-quiz-card public-quiz-start">
          <div className="public-quiz-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span>LectureAI</span>
          </div>
          <h1>{quiz.title}</h1>
          <p>{quiz.questions.length} вопросов</p>
          <button className="quiz-generate-btn" onClick={() => setStarted(true)}>Начать</button>
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="public-quiz">
        <div className="public-quiz-card">
          <div className="public-quiz-result">
            <div className={`result-score ${result.score >= 70 ? 'good' : result.score >= 40 ? 'mid' : 'bad'}`}>
              {result.score}%
            </div>
            <p className="result-text">
              Правильных ответов: {result.correct} из {result.total}
            </p>
          </div>

          <div className="quiz-questions">
            {quiz.questions.map((q) => {
              const r = result.results.find((r) => r.questionId === q.id)
              return (
                <div key={q.id} className="quiz-question-card">
                  <div className="quiz-q-content">
                    <p className="quiz-q-text">{q.question}</p>
                    <div className="quiz-q-options">
                      {q.options.map((opt) => {
                        const isSelected = r?.selectedId === opt.id
                        const isCorrect = r?.correctId === opt.id
                        let cls = 'quiz-q-option'
                        if (isCorrect) cls += ' correct'
                        if (isSelected && !isCorrect) cls += ' wrong'
                        return (
                          <div key={opt.id} className={cls}>
                            <span className={`quiz-q-dot ${isCorrect ? 'correct' : isSelected ? 'wrong' : ''}`} />
                            <span>{opt.text}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <button className="quiz-generate-btn" onClick={handleRetry}>Пройти снова</button>
        </div>
      </div>
    )
  }

  const answeredCount = Object.keys(answers).length
  const allAnswered = answeredCount === quiz.questions.length

  return (
    <div className="public-quiz">
      <div className="public-quiz-card">
        <div className="public-quiz-header">
          <h2>{quiz.title}</h2>
          <span className="quiz-badge">{answeredCount}/{quiz.questions.length}</span>
        </div>

        <div className="quiz-questions">
          {quiz.questions.map((q, qi) => (
            <div key={q.id} className="quiz-question-card">
              <div className="quiz-q-number">{qi + 1}</div>
              <div className="quiz-q-content">
                <p className="quiz-q-text">{q.question}</p>
                <div className="quiz-q-options">
                  {q.options.map((opt) => (
                    <div
                      key={opt.id}
                      className={`quiz-q-option selectable ${answers[q.id] === opt.id ? 'selected' : ''}`}
                      onClick={() => handleSelect(q.id, opt.id)}
                    >
                      <span className={`quiz-q-dot ${answers[q.id] === opt.id ? 'selected' : ''}`} />
                      <span>{opt.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="quiz-generate-btn"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
        >
          {submitting ? (
            <><div className="spinner" /> Проверяю...</>
          ) : (
            `Завершить (${answeredCount}/${quiz.questions.length})`
          )}
        </button>
      </div>
    </div>
  )
}
