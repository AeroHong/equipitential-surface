import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const A4_W = 210  // mm
const A4_H = 297  // mm
const MARGIN = 15 // mm

async function captureElement(el) {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: el.scrollWidth,
  })
}

function addCanvasToPdf(pdf, canvas, pageW, pageH) {
  const imgW = pageW
  const imgH = (canvas.height / canvas.width) * imgW

  if (imgH <= pageH) {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, MARGIN, imgW, imgH)
    return
  }

  // 내용이 한 페이지를 넘으면 분할
  const totalSubPages = Math.ceil(imgH / pageH)
  for (let p = 0; p < totalSubPages; p++) {
    if (p > 0) pdf.addPage()
    const srcY = Math.round((p / totalSubPages) * canvas.height)
    const srcH = Math.round(canvas.height / totalSubPages)
    const slice = document.createElement('canvas')
    slice.width  = canvas.width
    slice.height = srcH
    slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)
    const sliceH = Math.min(pageH, imgH - p * pageH)
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', MARGIN, MARGIN, imgW, sliceH)
  }
}

/**
 * 여러 DOM 섹션을 각각 한 페이지씩 캡처해 PDF로 생성합니다.
 * @param {HTMLElement[]} sections
 * @param {string} filename
 */
export async function generateMultiPagePDF(sections, filename = '보고서.pdf') {
  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW  = A4_W - MARGIN * 2
  const pageH  = A4_H - MARGIN * 2

  for (let i = 0; i < sections.length; i++) {
    if (i > 0) pdf.addPage()
    const canvas = await captureElement(sections[i])
    addCanvasToPdf(pdf, canvas, pageW, pageH)
  }

  pdf.save(filename)
}

// 하위 호환용 단일 페이지 함수
export async function generatePDFFromElement(reportEl, filename = '보고서.pdf') {
  await generateMultiPagePDF([reportEl], filename)
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
