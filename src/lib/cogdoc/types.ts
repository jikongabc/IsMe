export type CogDocCitation = {
  chunk_id?: string;
  source_type?: string;
  knowledge_id?: string;
  source?: string;
  page?: number | null;
  page_start?: number | null;
  page_end?: number | null;
};

export type CogDocEvidence = {
  chunk_id?: string;
  source?: string;
  page?: number | null;
  page_start?: number | null;
  page_end?: number | null;
  section_title?: string;
  text_preview?: string;
  rerank_score?: number | null;
};

export type CogDocChatResponse = {
  schema_version: string;
  request_id: string;
  trace_id: string;
  doc_id: string;
  session_id: string | null;
  task_type: string;
  answer: string;
  citations: CogDocCitation[];
  evidence: CogDocEvidence[];
  critique: string;
  is_valid: boolean;
};

export type CogDocErrorBody = {
  error_code?: string;
  message?: string;
  request_id?: string;
  trace_id?: string;
};

export type NormalizedChatResult = {
  answer: string;
  sessionId: string | null;
  requestId: string;
  traceId: string;
  taskType: string;
  isValid: boolean;
  citations: Array<{
    source: string;
    page: number | null;
    chunkId: string;
  }>;
  evidence: Array<{
    source: string;
    page: number | null;
    sectionTitle: string;
    preview: string;
  }>;
  demo: boolean;
};
