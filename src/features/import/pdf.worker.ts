/*
 * The worker of the PDF reader (roadmap F34). The PDF.js worker sets itself up when it loads, so the
 * reading of a long PDF never stops the page.
 */
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
