const fs = require('fs')
const path = require('path')
const { PDFDocument, StandardFonts } = require('pdf-lib')

async function main() {
  const dir = path.join(__dirname, '..', 'tests', 'fixtures')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const page = pdfDoc.addPage([612, 792])

  const lines = [
    'SyncNexus Phase 6 Fixture Document',
    '',
    'This PDF tests the document ingestion pipeline. Redis provides the',
    'message broker. BullMQ handles async processing. ChromaDB stores',
    'vector embeddings for retrieval-augmented generation.',
    '',
    'Section 2: Architecture Details',
    '',
    'The system uses presigned URLs for file uploads to MinIO. Documents',
    'are chunked with overlap for better retrieval quality. Each chunk is',
    'embedded and stored with metadata including roomId, documentId,',
    'filename, and chunkIndex.',
    '',
    'Section 3: Testing Strategy',
    '',
    'Integration tests verify the full pipeline: upload to MinIO, enqueue',
    'ingestion job, wait for BullMQ completion, assert Document status',
    'transitions from PENDING to PROCESSING to READY, and confirm chunks',
    'are retrievable from ChromaDB with correct metadata filters.',
  ]

  let y = 720
  for (const line of lines) {
    if (line === '') { y -= 16; continue }
    page.drawText(line, { x: 72, y, size: 11, font })
    y -= 16
  }

  const bytes = await pdfDoc.save()
  const outPath = path.join(dir, 'phase6-fixture.pdf')
  fs.writeFileSync(outPath, bytes)
  console.log('PDF created:', bytes.length, 'bytes')
}

main().catch(console.error)
