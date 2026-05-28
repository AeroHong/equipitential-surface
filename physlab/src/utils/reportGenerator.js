import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const A4_W = 210  // mm
const A4_H = 297  // mm
const MARGIN = 15 // mm

/**
 * SVG 요소를 PNG Data URL로 변환
 */
async function svgToDataUrl(svgEl, scale = 2) {
  const svgStr = new XMLSerializer().serializeToString(svgEl)
  const blob = new Blob([svgStr], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = svgEl.clientWidth  * scale
      canvas.height = svgEl.clientHeight * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Plotly 차트 DOM 요소에서 이미지 추출
 */
async function plotlyToDataUrl(plotEl, w = 600, h = 350) {
  if (!plotEl || !window.Plotly) return null
  try {
    return await window.Plotly.toImage(plotEl, { format: 'png', width: w, height: h })
  } catch {
    return null
  }
}

/**
 * 한글 폰트 없이 jsPDF가 한글을 올바르게 표현할 수 없으므로
 * html2canvas로 DOM 섹션을 캡처해서 이미지로 삽입합니다.
 *
 * @param {HTMLElement} reportEl - 숨겨진 보고서 DOM 요소
 * @param {string} filename
 */
export async function generatePDFFromElement(reportEl, filename = '보고서.pdf') {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = A4_W - MARGIN * 2
  const pageH = A4_H - MARGIN * 2

  // 첫 페이지: 전체 캡처
  const canvas = await html2canvas(reportEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')
  const imgW = pageW
  const imgH = (canvas.height / canvas.width) * imgW

  let y = MARGIN
  let remainH = imgH

  // 페이지 분할: imgH가 pageH를 넘으면 여러 페이지로
  const totalPages = Math.ceil(imgH / pageH)
  for (let page = 0; page < totalPages; page++) {
    if (page > 0) { pdf.addPage(); y = MARGIN }
    const srcY = page * (canvas.height / totalPages)
    const srcH = canvas.height / totalPages

    // 잘라낸 영역만 새 캔버스에 그려서 삽입
    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width  = canvas.width
    sliceCanvas.height = srcH
    const sCtx = sliceCanvas.getContext('2d')
    sCtx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

    const sliceData = sliceCanvas.toDataURL('image/png')
    const sliceH = Math.min(pageH, remainH)
    pdf.addImage(sliceData, 'PNG', MARGIN, y, imgW, sliceH)
    remainH -= sliceH
  }

  pdf.save(filename)
}

/**
 * 여러 학생의 보고서를 ZIP으로 묶어서 다운로드
 * @param {Array<{filename, element}>} items
 */
export async function downloadAllReportsAsZip(items, zipFilename = '전체_보고서.zip') {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  for (const { filename, element } of items) {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    const imgData = canvas.toDataURL('image/png')
    const pageW = A4_W - MARGIN * 2
    const imgH = (canvas.height / canvas.width) * pageW
    const pageH = A4_H - MARGIN * 2
    const totalPages = Math.ceil(imgH / pageH)

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage()
      const srcY = page * (canvas.height / totalPages)
      const srcH = canvas.height / totalPages
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width  = canvas.width
      sliceCanvas.height = srcH
      const sCtx = sliceCanvas.getContext('2d')
      sCtx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)
      const sliceH = Math.min(pageH, imgH - page * pageH)
      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', MARGIN, MARGIN, pageW, sliceH)
    }

    zip.file(filename, pdf.output('blob'))
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipFilename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
