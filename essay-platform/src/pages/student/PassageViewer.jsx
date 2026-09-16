import React from 'react'
import { sanitizePassageHtml } from '../../utils/sanitizeHtml.js'
import { toYoutubeEmbedUrl } from '../../utils/youtube.js'

/**
 * 지문(텍스트+외부 이미지/영상 링크) 읽기 전용 패널. 작성 중에도 계속 스크롤해서 참고할 수 있다.
 */
export default function PassageViewer({ passage }) {
  if (!passage) return null
  const embedUrl = toYoutubeEmbedUrl(passage.videoUrl)

  return (
    <div className="h-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-3">{passage.title}</h2>

      {passage.videoUrl && (
        embedUrl ? (
          <div className="aspect-video rounded-xl overflow-hidden border border-gray-200 mb-4">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              title="참고 영상"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <a
            href={passage.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mb-4 text-sm text-blue-600 hover:text-blue-800 underline underline-offset-2"
          >
            🎬 영상 자료 보기 →
          </a>
        )
      )}

      {passage.bodyHtml ? (
        <div
          className="passage-rich text-sm leading-relaxed text-gray-700"
          dangerouslySetInnerHTML={{ __html: sanitizePassageHtml(passage.bodyHtml) }}
        />
      ) : (
        <>
          {(passage.imageUrls || []).map((url, i) => (
            <img key={i} src={url} alt="" className="w-full rounded-xl border border-gray-200 mb-4" />
          ))}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {passage.bodyText}
          </div>
        </>
      )}
    </div>
  )
}
