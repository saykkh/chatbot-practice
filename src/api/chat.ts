export interface GenerateStoryRequest {
  keywords: string[]
}

export interface GenerateStoryResponse {
  story: string
  keywords: string[]
}

interface ErrorResponse {
  error?: string
}

export async function generateStory(keywords: string[]): Promise<GenerateStoryResponse> {
  const cleanedKeywords = keywords
    .map((kw) => kw.trim())
    .filter((kw) => kw.length > 0)

  if (cleanedKeywords.length === 0) {
    throw new Error('동화를 만들 키워드를 1개 이상 입력해 주세요.')
  }

  if (cleanedKeywords.length > 10) {
    throw new Error('키워드는 최대 10개까지만 입력할 수 있습니다.')
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keywords: cleanedKeywords }),
  })

  const data = (await response.json()) as Partial<GenerateStoryResponse> & ErrorResponse

  if (!response.ok || !data.story) {
    throw new Error(
      data.error || `동화를 생성하는 중 오류가 발생했습니다. (상태 코드: ${response.status})`
    )
  }

  return {
    story: data.story,
    keywords: data.keywords ?? cleanedKeywords,
  }
}

