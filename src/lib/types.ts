export type JobStatus =
  | "queued"
  | "crawling"
  | "capturing"
  | "extracting"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

export const STATUS_PROGRESS: Record<JobStatus, number> = {
  queued: 0,
  crawling: 20,
  capturing: 40,
  extracting: 60,
  generating: 80,
  completed: 100,
  failed: 100,
  cancelled: 100,
};

export interface GenerationJob {
  id: string;
  session_id: string | null;
  source_url: string;
  normalized_domain: string;
  status: JobStatus;
  progress: number;
  max_pages: number;
  output_language: string;
  error_code: string | null;
  error_message: string | null;
  retry_of: string | null;
  pages_analyzed: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColorToken {
  role: string;
  value: string;
}

export interface FontToken {
  family: string;
  weights?: number[];
  sizes?: number[];
  role?: string;
}

export interface DesignExtraction {
  colors: ColorToken[];
  typography: FontToken[];
  layout_patterns: string[];
  components: string[];
  metadata: {
    title?: string;
    description?: string;
    theme?: "light" | "dark" | "unknown";
    pagesAnalyzed: string[];
    pagesFailed: number;
  };
  confidence_score: number;
}
