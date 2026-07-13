export type JobStatus =
  | "queued"
  | "crawling"
  | "capturing"
  | "extracting"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

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

export interface TypographyRole {
  role: "h1" | "h2" | "h3" | "body" | "nav" | string;
  family: string;
  weight: string;
  size: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface CtaButton {
  text?: string;
  family: string;
  weight: string;
  size: string;
  bg: string;
  color: string;
  radius: string;
  padding: string;
  border: string;
}

export interface FontFace {
  family: string;
  weights: string;
}

export interface DesignExtraction {
  colors: ColorToken[];
  typography: FontToken[];
  layout_patterns: string[];
  components: string[];
  tokens?: {
    spacing: string[];
    radii: string[];
    shadows: string[];
    maxWidths: string[];
    lineHeights: string[];
    letterSpacing: string[];
    cssVariables: Record<string, string>;
  };
  component_details?: Array<{
    type: string;
    text?: string;
    colors?: string[];
    typography?: string;
    spacing?: string;
    shape?: string;
  }>;
  surfaces?: Array<{ selector: string; background: string; color: string }>;
  imagery?: { imageCount: number; examples: string[] };
  typographyRoles?: TypographyRole[];
  ctaButtons?: CtaButton[];
  fontFaces?: FontFace[];
  metadata: {
    title?: string;
    description?: string;
    theme?: "light" | "dark" | "unknown";
    pagesAnalyzed: string[];
    pagesFailed: number;
  };
  confidence_score: number;
}
