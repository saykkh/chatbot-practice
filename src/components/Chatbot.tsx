import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { generateStory } from '../api/chat.ts'

interface StoryItem {
  id: string
  keywords: string[]
  story: string
  createdAt: string
}

type VoicePersonaId = 'mom' | 'dad' | 'scary_uncle' | 'grandpa' | 'grandma'

interface VoicePersona {
  id: VoicePersonaId
  label: string
  emoji: string
  description: string
  targetGender: 'female' | 'male'
  preferredKeywords: string[]
  // 여성 기본 음성일 때 적용할 음높이(pitch)
  femaleVoicePitch: {
    base: number
    exclamation: number
    question: number
  }
  // 남성 기본 음성(InJoon 등)이 있을 때 적용할 음높이(pitch)
  maleVoicePitch: {
    base: number
    exclamation: number
    question: number
  }
  rateMultiplier: number
  pauseMs: number
}

const VOICE_PERSONAS: VoicePersona[] = [
  {
    id: 'mom',
    label: '밝은 엄마 버전',
    emoji: '👩',
    description: '다정하고 통통 튀는 밝은 엄마의 구연동화 목소리',
    targetGender: 'female',
    preferredKeywords: ['sunhi', 'seohyeon', 'yujin', 'google', 'yuna', '유나', 'sora'],
    femaleVoicePitch: {
      base: 1.16,
      exclamation: 1.25,
      question: 1.2,
    },
    maleVoicePitch: {
      base: 1.35,
      exclamation: 1.45,
      question: 1.4,
    },
    rateMultiplier: 0.96,
    pauseMs: 220,
  },
  {
    id: 'dad',
    label: '유쾌한 아버지 버전',
    emoji: '👨',
    description: '씩씩하고 신나게 읽어주는 장난꾸러기 아빠 목소리',
    targetGender: 'male',
    preferredKeywords: ['injoon', 'hyunsu', 'gookmin', 'bongjin', 'google'],
    femaleVoicePitch: {
      base: 0.78,
      exclamation: 0.88,
      question: 0.84,
    },
    maleVoicePitch: {
      base: 1.06,
      exclamation: 1.18,
      question: 1.12,
    },
    rateMultiplier: 1.05,
    pauseMs: 190,
  },
  {
    id: 'scary_uncle',
    label: '무서운 아저씨 버전',
    emoji: '🕶️',
    description: '낮고 묵직한 저음으로 긴장감 있게 읽어주는 아저씨 목소리',
    targetGender: 'male',
    preferredKeywords: ['bongjin', 'injoon', 'hyunsu', 'gookmin', 'google'],
    femaleVoicePitch: {
      base: 0.52,
      exclamation: 0.62,
      question: 0.58,
    },
    maleVoicePitch: {
      base: 0.68,
      exclamation: 0.78,
      question: 0.74,
    },
    rateMultiplier: 0.85,
    pauseMs: 380,
  },
  {
    id: 'grandpa',
    label: '다정한 할아버지 버전',
    emoji: '👴',
    description: '허허 웃으며 느긋하고 인자하게 들려주는 할아버지 목소리',
    targetGender: 'male',
    preferredKeywords: ['bongjin', 'gookmin', 'injoon', 'hyunsu', 'google'],
    femaleVoicePitch: {
      base: 0.66,
      exclamation: 0.74,
      question: 0.72,
    },
    maleVoicePitch: {
      base: 0.84,
      exclamation: 0.92,
      question: 0.9,
    },
    rateMultiplier: 0.8,
    pauseMs: 360,
  },
  {
    id: 'grandma',
    label: '사랑스러운 할머니 버전',
    emoji: '👵',
    description: '무릎에 앉혀놓고 조곤조곤 포근하게 들려주는 할머니 목소리',
    targetGender: 'female',
    preferredKeywords: ['soonbok', 'yujin', 'sunhi', 'google', 'yuna', '유나'],
    femaleVoicePitch: {
      base: 0.94,
      exclamation: 1.03,
      question: 1.0,
    },
    maleVoicePitch: {
      base: 1.2,
      exclamation: 1.28,
      question: 1.25,
    },
    rateMultiplier: 0.82,
    pauseMs: 340,
  },
]

const MAX_KEYWORDS = 10

const SUGGESTED_KEYWORDS = [
  '쌍둥이 아기곰',
  '무지개 미끄럼틀',
  '구름 솜사탕',
  '노래하는 별',
  '간지럼 요정',
  '초콜릿 기차',
  '하늘 나는 거북이',
  '반짝이 우산',
  '춤추는 강아지',
  '마법 비눗방울',
]

function isMaleVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase()
  return (
    name.includes('injoon') ||
    name.includes('hyunsu') ||
    name.includes('bongjin') ||
    name.includes('gookmin') ||
    name.includes('male') ||
    name.includes('남성')
  )
}

function selectBestVoiceForPersona(
  voices: SpeechSynthesisVoice[],
  persona: VoicePersona
): SpeechSynthesisVoice | null {
  const koreanVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('ko'))
  if (koreanVoices.length === 0) {
    return null
  }

  const scoreVoice = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase()
    let score = 10

    // 페르소나별 선호 음성 키워드 가점
    const prefIndex = persona.preferredKeywords.findIndex((kw) => name.includes(kw))
    if (prefIndex !== -1) {
      score += 120 - prefIndex * 15
    }

    // 성별 일치 가점
    const voiceIsMale = isMaleVoice(voice)
    if (persona.targetGender === 'male' && voiceIsMale) {
      score += 90
    } else if (persona.targetGender === 'female' && !voiceIsMale) {
      score += 70
    }

    // 신경망/고품질 온라인 음성 가점
    if (name.includes('natural') || name.includes('neural') || name.includes('online')) {
      score += 80
    }
    if (name.includes('google')) {
      score += 75
    }
    if (!voice.localService) {
      score += 45
    }

    // 구형 기계음(Heami)은 가장 후순위로 감점
    if (name.includes('heami')) {
      score -= 100
    }

    return score
  }

  const sorted = [...koreanVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))
  return sorted[0] ?? null
}

function splitStoryIntoSentences(story: string): string[] {
  const cleaned = story
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .trim()

  const matches = cleaned.match(/[^.!?]+[.!?]+["'”’)]*|[^.!?]+$/g)
  if (!matches) {
    return [cleaned]
  }

  return matches.map((s) => s.trim()).filter((s) => s.length > 0)
}

export default function Chatbot() {
  const [keywords, setKeywords] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [stories, setStories] = useState<StoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [speakingStoryId, setSpeakingStoryId] = useState<string | null>(null)
  const [selectedPersonaId, setSelectedPersonaId] = useState<VoicePersonaId>('mom')
  const [speechRate, setSpeechRate] = useState<number>(1.0)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])

  const playbackSessionRef = useRef<number>(0)
  const sentenceTimerRef = useRef<number | null>(null)

  const currentPersona =
    VOICE_PERSONAS.find((p) => p.id === selectedPersonaId) ?? VOICE_PERSONAS[0]

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      setAvailableVoices(voices)
    }

    updateVoices()
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices)
      if (sentenceTimerRef.current !== null) {
        window.clearTimeout(sentenceTimerRef.current)
      }
      window.speechSynthesis.cancel()
    }
  }, [])

  const stopSpeaking = () => {
    playbackSessionRef.current += 1
    if (sentenceTimerRef.current !== null) {
      window.clearTimeout(sentenceTimerRef.current)
      sentenceTimerRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeakingStoryId(null)
  }

  const speakStory = (storyItem: StoryItem, personaOverride?: VoicePersona) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setErrorMessage('이 브라우저에서는 음성 읽어주기(Web Speech API) 기능을 지원하지 않습니다.')
      return
    }

    stopSpeaking()

    const persona = personaOverride ?? currentPersona
    const currentSession = playbackSessionRef.current
    const voices =
      availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices()
    const chosenVoice = selectBestVoiceForPersona(voices, persona)
    const chosenIsMale = chosenVoice ? isMaleVoice(chosenVoice) : false
    const pitchConfig = chosenIsMale ? persona.maleVoicePitch : persona.femaleVoicePitch

    const sentences = splitStoryIntoSentences(storyItem.story)
    if (sentences.length === 0) {
      return
    }

    setSpeakingStoryId(storyItem.id)

    const speakNextSentence = (index: number) => {
      if (playbackSessionRef.current !== currentSession) {
        return
      }

      if (index >= sentences.length) {
        setSpeakingStoryId(null)
        return
      }

      const sentence = sentences[index]
      const utterance = new SpeechSynthesisUtterance(sentence)
      utterance.lang = 'ko-KR'

      if (chosenVoice) {
        utterance.voice = chosenVoice
      }

      const isExclamationOrDialogue =
        sentence.includes('!') ||
        sentence.includes('"') ||
        sentence.includes('“') ||
        sentence.includes("'")
      const isQuestion = sentence.includes('?')

      const effectiveBaseRate = Math.min(
        Math.max(persona.rateMultiplier * speechRate, 0.65),
        1.35
      )

      if (isExclamationOrDialogue) {
        utterance.pitch = pitchConfig.exclamation
        utterance.rate = Math.min(effectiveBaseRate + 0.03, 1.35)
      } else if (isQuestion) {
        utterance.pitch = pitchConfig.question
        utterance.rate = effectiveBaseRate
      } else {
        utterance.pitch = pitchConfig.base
        utterance.rate = effectiveBaseRate
      }

      utterance.onend = () => {
        if (playbackSessionRef.current !== currentSession) {
          return
        }
        sentenceTimerRef.current = window.setTimeout(() => {
          speakNextSentence(index + 1)
        }, persona.pauseMs)
      }

      utterance.onerror = () => {
        if (playbackSessionRef.current === currentSession) {
          setSpeakingStoryId(null)
        }
      }

      window.speechSynthesis.speak(utterance)
    }

    speakNextSentence(0)
  }

  const handlePersonaChange = (persona: VoicePersona) => {
    setSelectedPersonaId(persona.id)
    if (speakingStoryId) {
      const activeStory = stories.find((s) => s.id === speakingStoryId)
      if (activeStory) {
        speakStory(activeStory, persona)
      }
    }
  }

  const parseInputKeywords = (raw: string): string[] => {
    return raw
      .split(/[,，\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  const addKeywordsFromText = (raw: string) => {
    const candidates = parseInputKeywords(raw)
    if (candidates.length === 0) {
      return
    }

    setErrorMessage(null)

    setKeywords((prev) => {
      const next = [...prev]
      for (const item of candidates) {
        if (next.length >= MAX_KEYWORDS) {
          setErrorMessage(`키워드는 최대 ${MAX_KEYWORDS}개까지만 입력할 수 있어요!`)
          break
        }
        if (!next.includes(item)) {
          next.push(item)
        }
      }
      return next
    })
    setInputValue('')
  }

  const handleAddButtonClick = () => {
    if (!inputValue.trim()) {
      setErrorMessage('추가할 키워드를 입력해 주세요!')
      return
    }
    if (keywords.length >= MAX_KEYWORDS) {
      setErrorMessage(`키워드는 최대 ${MAX_KEYWORDS}개까지만 입력할 수 있어요!`)
      return
    }
    addKeywordsFromText(inputValue)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (inputValue.trim()) {
        addKeywordsFromText(inputValue)
      }
    }
  }

  const handleRemoveKeyword = (target: string) => {
    setKeywords((prev) => prev.filter((kw) => kw !== target))
    setErrorMessage(null)
  }

  const handleSuggestedClick = (suggested: string) => {
    if (keywords.includes(suggested)) {
      handleRemoveKeyword(suggested)
      return
    }
    if (keywords.length >= MAX_KEYWORDS) {
      setErrorMessage(`키워드는 최대 ${MAX_KEYWORDS}개까지만 선택할 수 있어요!`)
      return
    }
    setErrorMessage(null)
    setKeywords((prev) => [...prev, suggested])
  }

  const handleClearKeywords = () => {
    setKeywords([])
    setInputValue('')
    setErrorMessage(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const pendingFromInput = parseInputKeywords(inputValue)
    const combined = [...keywords]

    for (const item of pendingFromInput) {
      if (!combined.includes(item)) {
        combined.push(item)
      }
    }

    if (combined.length === 0) {
      setErrorMessage('동화를 만들 키워드를 1개 이상 입력해 주세요! (예: 쌍둥이 토끼, 무지개)')
      return
    }

    if (combined.length > MAX_KEYWORDS) {
      setErrorMessage(`키워드는 최대 ${MAX_KEYWORDS}개까지만 입력할 수 있어요! 현재 ${combined.length}개입니다.`)
      return
    }

    setKeywords(combined)
    setInputValue('')
    stopSpeaking()
    setIsLoading(true)

    try {
      const result = await generateStory(combined)
      const newStory: StoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        keywords: result.keywords,
        story: result.story,
        createdAt: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
      setStories((prev) => [newStory, ...prev])
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '동화를 만드는 중에 문제가 발생했어요. 다시 시도해 주세요.'
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="chatbot-container">
      <header className="chatbot-header">
        <div className="header-badge">5살 쌍둥이 맞춤형 AI 동화책</div>
        <h1>둥이네 반짝반짝 동화나라</h1>
        <p className="header-subtitle">
          좋아하는 단어(키워드)를 최대 10개까지 골라주면 우리 가족 목소리로 동화를 들려줄게요!
        </p>
      </header>

      <section className="keyword-panel" aria-label="동화 키워드 입력">
        <form onSubmit={handleSubmit} className="keyword-form">
          <div className="input-row">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                keywords.length >= MAX_KEYWORDS
                  ? '키워드 10개를 모두 채웠어요!'
                  : '키워드를 입력하고 Enter 또는 추가를 눌러보세요 (쉼표로 여러 개 입력 가능)'
              }
              disabled={isLoading || keywords.length >= MAX_KEYWORDS}
              className="keyword-input"
              aria-label="키워드 입력"
            />
            <button
              type="button"
              onClick={handleAddButtonClick}
              disabled={isLoading || keywords.length >= MAX_KEYWORDS}
              className="btn-secondary"
            >
              키워드 추가
            </button>
          </div>

          <div className="suggested-section">
            <span className="suggested-label">추천 키워드 콕콕:</span>
            <div className="suggested-list">
              {SUGGESTED_KEYWORDS.map((item) => {
                const isSelected = keywords.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleSuggestedClick(item)}
                    disabled={isLoading || (!isSelected && keywords.length >= MAX_KEYWORDS)}
                    className={`suggested-chip ${isSelected ? 'selected' : ''}`}
                  >
                    {isSelected ? `✓ ${item}` : `+ ${item}`}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="selected-keywords-box">
            <div className="selected-header">
              <span>
                선택된 키워드 <strong>{keywords.length}</strong> / {MAX_KEYWORDS}개
              </span>
              {keywords.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearKeywords}
                  disabled={isLoading}
                  className="btn-clear"
                >
                  모두 지우기
                </button>
              )}
            </div>

            {keywords.length === 0 ? (
              <p className="empty-keywords-hint">
                아직 선택된 키워드가 없어요. 위 입력창에 단어를 입력하거나 추천 키워드를 눌러보세요!
              </p>
            ) : (
              <div className="keyword-chips">
                {keywords.map((kw, index) => (
                  <span key={kw} className="keyword-chip">
                    <span className="chip-index">{index + 1}</span>
                    {kw}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      disabled={isLoading}
                      className="chip-remove"
                      aria-label={`${kw} 삭제`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="error-banner" role="alert">
              {errorMessage}
            </div>
          )}

          <button type="submit" disabled={isLoading} className="btn-submit">
            {isLoading ? '동화 요정이 재미있는 이야기를 만들고 있어요...' : '동화 만들기 ✨'}
          </button>
        </form>
      </section>

      <section className="stories-section" aria-live="polite">
        <div className="persona-panel">
          <div className="persona-panel-header">
            <span className="persona-title">🎭 누구 목소리로 들어볼까요? (무료 음성 캐릭터)</span>
            <div className="voice-control-group">
              <label htmlFor="speech-rate-select" className="rate-label">
                빠르기 조절:
              </label>
              <select
                id="speech-rate-select"
                value={speechRate}
                onChange={(e) => setSpeechRate(Number(e.target.value))}
                className="rate-select"
              >
                <option value={0.9}>조금 천천히 (0.9x)</option>
                <option value={1.0}>기본 속도 (1.0x)</option>
                <option value={1.1}>조금 빠르게 (1.1x)</option>
              </select>
            </div>
          </div>

          <div className="persona-grid" role="radiogroup" aria-label="읽어주기 목소리 버전 선택">
            {VOICE_PERSONAS.map((persona) => {
              const isSelected = persona.id === selectedPersonaId
              return (
                <button
                  key={persona.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handlePersonaChange(persona)}
                  className={`persona-card ${isSelected ? 'active' : ''}`}
                >
                  <span className="persona-emoji" aria-hidden="true">
                    {persona.emoji}
                  </span>
                  <span className="persona-name">{persona.label}</span>
                </button>
              )
            })}
          </div>
          <p className="persona-desc">
            {currentPersona.emoji} <strong>{currentPersona.label}</strong>: {currentPersona.description}
          </p>
        </div>

        {stories.length === 0 && !isLoading ? (
          <div className="empty-story-card">
            <div className="empty-story-icon" aria-hidden="true">
              📚
            </div>
            <h2>어떤 이야기를 만들어 볼까요?</h2>
            <p>
              쌍둥이 친구들이 좋아하는 동물, 장난감, 간식 이름을 1~10개 입력하고
              <br />
              <strong>동화 만들기</strong> 버튼을 눌러보세요!
            </p>
          </div>
        ) : null}

        {stories.map((item, idx) => {
          const isSpeakingThis = speakingStoryId === item.id
          return (
            <article key={item.id} className={`story-card ${idx === 0 ? 'latest' : ''}`}>
              <div className="story-card-header">
                <div className="story-used-keywords">
                  {item.keywords.map((kw) => (
                    <span key={kw} className="story-kw-badge">
                      #{kw}
                    </span>
                  ))}
                </div>
                <span className="story-meta">
                  {item.createdAt} · 공백 포함 {item.story.length}자
                </span>
              </div>

              <div className="story-content">
                {item.story.split('\n').map((line, i) =>
                  line.trim() ? <p key={i}>{line}</p> : null
                )}
              </div>

              <div className="story-card-actions">
                {isSpeakingThis ? (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="btn-tts speaking"
                  >
                    ⏹ 멈추기
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => speakStory(item)}
                    className="btn-tts"
                  >
                    🔊 읽어주기 ({currentPersona.emoji} {currentPersona.label})
                  </button>
                )}

                {isSpeakingThis && (
                  <span className="speaking-indicator">
                    {currentPersona.emoji} <strong>{currentPersona.label}</strong>으로 동화를 읽어주는 중이에요...
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
