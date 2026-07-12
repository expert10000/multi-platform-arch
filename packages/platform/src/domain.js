export const DOCUMENT_STATUSES = Object.freeze([
  "draft",
  "review",
  "approved",
  "archived"
]);

export const PROCESSING_JOB_TYPES = Object.freeze([
  "extract-text",
  "thumbnail",
  "summarize",
  "index-search"
]);

export const PROCESSING_JOB_STATUSES = Object.freeze([
  "queued",
  "running",
  "completed",
  "failed"
]);

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function isDocumentStatus(value) {
  return DOCUMENT_STATUSES.includes(value);
}

export function isProcessingJobType(value) {
  return PROCESSING_JOB_TYPES.includes(value);
}
