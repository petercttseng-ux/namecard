# Bundled OCR runtime

Tesseract.js 5.1.1 (`tesseract.min.js`, `worker.min.js`) and Tesseract.js-core 5.1.1 (`tesseract-core-lstm.wasm.js`, `tesseract-core-lstm.wasm`) are Apache-2.0 licensed. License texts are included alongside these files.

Downloaded with HTTPS certificate verification from pinned jsDelivr npm URLs:

- https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/
- https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/
- https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_tra@1.0.0/4.0.0_best_int/chi_tra.traineddata.gz
- https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz

The Tesseract language data in ../../ocr-data is Apache-2.0 licensed (see LICENSE-tesseract.js-core). These files ship with the application to avoid third-party OCR requests. Do not hand edit generated runtime assets.
