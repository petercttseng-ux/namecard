# Bundled OCR runtime

Tesseract.js 5.1.1 (`tesseract.min.js`, `worker.min.js`) and Tesseract.js-core 5.1.1 (`tesseract-core-lstm.wasm.js`, `tesseract-core-lstm.wasm`) are Apache-2.0 licensed. License texts are included alongside these files.

Downloaded with HTTPS certificate verification from pinned sources:

- https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/
- https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/
- https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/4.1.0/chi_tra.traineddata
- https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/4.1.0/eng.traineddata

The full precision LSTM models in ../../ocr-data are Apache-2.0 licensed (see LICENSE-tesseract.js-core). They were deterministically gzip-compressed (mtime=0); SHA256SUMS lists the distributed files. The original model SHA-256 values are recorded in MODEL-SHA256SUMS. Model cache namespace: namecard-tessdata-best-4.1.0. These replace the older integer models and do not use their cached entries.

All OCR assets ship with the application to avoid third-party OCR requests. Do not hand edit generated runtime assets.
