import type { IncomingMessage, ServerResponse } from 'node:http'

export const SYSTEM_PROMPT = `당신은 5살 쌍둥이 아이들에게 밝고 다정한 목소리로 구연동화를 들려주는 엄마 동화 작가입니다.
사용자가 입력한 키워드(1~10개)를 모두 자연스럽게 활용하여 재미있는 창작 동화를 만들어 주세요.

[작성 규칙]
1. 반드시 한국어로 작성하고, 공백을 포함하여 전체 길이를 반드시 500자 이내(권장 350~450자)로 작성해 주세요.
2. 5살 아이들의 언어 발달 수준에 맞춰 쉽고 친근한 단어, 리듬감 있는 의성어·의태어(반짝반짝, 포근포근, 폴짝 등), 그리고 엄마가 아이에게 다정하게 이야기해 주는 듯한 짧은 문장(~했답니다, ~했어요, ~였지요!)을 사용해 주세요.
3. 아이들이 재미있게 들을 수 있도록 귀여운 캐릭터, 상상력 넘치는 사건, 유쾌한 유머와 귀여운 반전을 적절히 담아 주세요.
4. 이야기에는 분명한 '시작 - 사건 전개 - 즐거운 결말' 구조가 포함되어야 합니다.
5. 무섭거나 폭력적이거나 부정적인 내용은 절대 포함하지 말고, 항상 긍정적이고 따뜻하며 사랑스러운 분위기로 작성해 주세요.
6. 음성으로 읽었을 때 자연스럽도록 특수기호 이모지(✨, 🐻 등)는 넣지 말고, 제목이나 부가 설명 없이 동화 본문만 바로 출력해 주세요.`

interface ChatRequestBody {
  keywords?: string[] | string
}

interface VercelLikeRequest extends IncomingMessage {
  body?: unknown
}

interface VercelLikeResponse extends ServerResponse {
  status?: (statusCode: number) => VercelLikeResponse
  json?: (body: unknown) => void
}

interface OpenAIResponseContentItem {
  type?: string
  text?: string
}

interface OpenAIResponseOutputItem {
  type?: string
  content?: OpenAIResponseContentItem[]
}

interface OpenAIResponsesApiResult {
  output_text?: string
  output?: OpenAIResponseOutputItem[]
  error?: {
    message?: string
  }
}

function sendJson(res: VercelLikeResponse, statusCode: number, data: unknown): void {
  if (typeof res.status === 'function') {
    const statusRes = res.status(statusCode)
    if (typeof statusRes.json === 'function') {
      statusRes.json(data)
      return
    }
  }
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

async function parseRequestBody(req: VercelLikeRequest): Promise<ChatRequestBody> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return JSON.parse(req.body) as ChatRequestBody
    }
    if (typeof req.body === 'object') {
      return req.body as ChatRequestBody
    }
  }

  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer | string) => {
      raw += chunk.toString()
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw) as ChatRequestBody)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function extractTextFromResponse(data: OpenAIResponsesApiResult): string {
  if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text.trim()
  }

  if (Array.isArray(data.output)) {
    const texts: string[] = []
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const contentPart of item.content) {
          if (typeof contentPart.text === 'string' && contentPart.text.trim()) {
            texts.push(contentPart.text.trim())
          }
        }
      }
    }
    if (texts.length > 0) {
      return texts.join('\n').trim()
    }
  }

  return ''
}

function enforceMaxLength(story: string, maxChars = 500): string {
  const normalized = story.trim()
  if (normalized.length <= maxChars) {
    return normalized
  }

  const sliced = normalized.slice(0, maxChars)
  const lastSentenceEnd = Math.max(
    sliced.lastIndexOf('.'),
    sliced.lastIndexOf('!'),
    sliced.lastIndexOf('?'),
    sliced.lastIndexOf('요.'),
    sliced.lastIndexOf('다.')
  )

  if (lastSentenceEnd > maxChars * 0.6) {
    return sliced.slice(0, lastSentenceEnd + 1).trim()
  }

  return sliced.trim()
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: '허용되지 않는 요청 방식입니다. POST 요청만 지원합니다.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    sendJson(res, 500, {
      error: '서버에 OPENAI_API_KEY가 설정되어 있지 않습니다. .env.local 파일을 확인해 주세요.',
    })
    return
  }

  let body: ChatRequestBody
  try {
    body = await parseRequestBody(req)
  } catch {
    sendJson(res, 400, { error: '잘못된 요청 형식입니다.' })
    return
  }

  const rawKeywords = Array.isArray(body.keywords)
    ? body.keywords
    : typeof body.keywords === 'string'
      ? body.keywords.split(',')
      : []

  const keywords = rawKeywords
    .map((kw) => String(kw).trim())
    .filter((kw) => kw.length > 0)

  if (keywords.length === 0) {
    sendJson(res, 400, { error: '동화를 만들 키워드를 1개 이상 입력해 주세요.' })
    return
  }

  if (keywords.length > 10) {
    sendJson(res, 400, { error: '키워드는 최대 10개까지만 입력할 수 있습니다.' })
    return
  }

  const userPrompt = `다음 키워드를 모두 사용하여 5살 쌍둥이 아이들을 위한 재미있고 따뜻한 창작 동화를 공백 포함 500자 이내의 한국어로 만들어 주세요.\n\n키워드: ${keywords.join(', ')}`

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-6-luna',
        reasoning: {
          effort: 'none',
        },
        instructions: SYSTEM_PROMPT,
        input: userPrompt,
      }),
    })

    const data = (await response.json()) as OpenAIResponsesApiResult

    if (!response.ok) {
      const errorMessage =
        data.error?.message || `OpenAI API 호출 중 오류가 발생했습니다. (상태 코드: ${response.status})`
      sendJson(res, response.status, { error: errorMessage })
      return
    }

    const rawStory = extractTextFromResponse(data)
    if (!rawStory) {
      sendJson(res, 500, { error: '동화를 생성하지 못했습니다. 다시 시도해 주세요.' })
      return
    }

    const story = enforceMaxLength(rawStory, 500)
    sendJson(res, 200, { story, keywords })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : '서버에서 OpenAI API를 호출하는 중 알 수 없는 오류가 발생했습니다.'
    sendJson(res, 500, { error: message })
  }
}
