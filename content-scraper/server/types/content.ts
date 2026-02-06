/**
 * Content Types
 *
 * Type definitions for scraped content from blogs, LinkedIn, and Reddit.
 */

/**
 * Blog/Source types
 */
export type SourceType =
  | "MCP-First Startups"
  | "Enterprise"
  | "Trendsetter"
  | "Community";

export const SOURCE_TYPES: SourceType[] = [
  "MCP-First Startups",
  "Enterprise",
  "Trendsetter",
  "Community",
];

/**
 * Blog source
 */
export interface Blog {
  id: string;
  name: string;
  url: string;
  feed_url: string | null;
  authority: number; // 0.0 to 1.0
  type: SourceType;
  created_at: string;
}

export interface BlogInsert {
  name: string;
  url: string;
  feed_url?: string | null;
  authority: number;
  type: SourceType;
}

/**
 * Article from blog
 */
export interface Article {
  id: string;
  blog_id: string;
  title: string;
  url: string;
  published_at: string;
  publication_week: string;
  summary: string;
  key_points: string[];
  post_score: number;
  scraped_at: string;
}

export interface ArticleInsert {
  blog_id: string;
  title: string;
  url: string;
  published_at: string;
  publication_week: string;
  summary: string;
  key_points: string[];
  post_score: number;
}

export interface ArticleWithBlog extends Article {
  blog: Blog;
}

/**
 * LLM Response types
 */
export interface LLMArticleListResponse {
  articles: Array<{
    title: string;
    url: string;
    published_at: string | null;
  }>;
}

export interface LLMArticleAnalysisResponse {
  is_mcp_related: boolean;
  summary: string;
  key_points: string[];
  quality_score: number;
}

/**
 * LinkedIn types
 */
export type LinkedInContentType =
  | "mcp-startups"
  | "enterprise"
  | "trendsetter"
  | "community";

export interface LinkedInSource {
  id: string;
  name: string;
  profile_url: string;
  authority: number;
  type: SourceType;
  active: boolean;
  created_at: string;
}

export interface LinkedInSourceInsert {
  name: string;
  profile_url: string;
  authority: number;
  type: SourceType;
  active?: boolean;
}

export interface LinkedInContent {
  id: number;
  post_id: string;
  url: string | null;
  author_name: string | null;
  author_headline: string | null;
  author_profile_url: string | null;
  author_profile_image: string | null;
  content: string | null;
  num_likes: number;
  num_comments: number;
  num_reposts: number;
  post_type: string;
  media_url: string | null;
  published_at: string | null;
  scraped_at: string | null;
  post_score: number;
  type: LinkedInContentType;
  created_at: string;
  updated_at: string;
  week_date: string | null;
}

export interface LinkedInContentInsert {
  post_id: string;
  url: string | null;
  author_name: string | null;
  author_headline: string | null;
  author_profile_url: string | null;
  author_profile_image: string | null;
  content: string | null;
  num_likes: number;
  num_comments: number;
  num_reposts: number;
  post_type: string;
  media_url: string | null;
  published_at: string | null;
  post_score: number;
  type: LinkedInContentType;
  week_date: string | null;
  content_hash?: string;
}

export interface LinkedInRawPost {
  type: string;
  id: string;
  linkedinUrl: string;
  content: string;
  author: {
    name: string;
    publicIdentifier: string;
    linkedinUrl: string;
    info?: string;
    avatar?: {
      url: string;
    };
  };
  postedAt: {
    timestamp: number;
    date: string;
  };
  repostedBy?: {
    name: string;
    publicIdentifier: string;
    linkedinUrl: string;
  };
  repostedAt?: {
    timestamp: number;
    date: string;
  };
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  postImages?: Array<{ url: string }>;
  postVideo?: { videoUrl: string; thumbnailUrl: string };
}

export interface LLMLinkedInPostAnalysisResponse {
  is_relevant: boolean;
  summary: string;
  key_points: string[];
  quality_score: number;
  relevance_reason: string;
}

/**
 * Reddit types
 */
export type RedditContentType =
  | "Trendsetters"
  | "Enterprise"
  | "MCP-First Startups"
  | "Community";

export interface RedditSource {
  id: string;
  name: string;
  subreddit: string;
  authority: number;
  type: SourceType;
  active: boolean;
  created_at: string;
}

export interface RedditSourceInsert {
  name: string;
  subreddit: string;
  authority: number;
  type: SourceType;
  active?: boolean;
}

export interface RedditContent {
  id: number;
  title: string;
  author: string;
  subreddit: string;
  selftext: string | null;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_at: number;
  scraped_at: string;
  updated_at: string;
  type: RedditContentType;
  authority: number;
  post_score: number;
  week_date: string | null;
}

export interface RedditContentInsert {
  title: string;
  author: string;
  subreddit: string;
  selftext: string | null;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_at: number;
  type: RedditContentType;
  authority: number;
  post_score: number;
  week_date: string | null;
  content_hash?: string;
}

export interface RedditRawPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
  is_self: boolean;
  flair: string | null;
  nsfw: boolean;
}

export interface LLMRedditPostAnalysisResponse {
  is_relevant: boolean;
  summary: string;
  key_points: string[];
  quality_score: number;
  relevance_reason: string;
}

/**
 * Dashboard stats
 */
export interface DashboardStats {
  totalBlogs: number;
  totalArticles: number;
  averageAuthority: number;
  typesCount: number;
}

/**
 * Scrape results
 */
export interface ScrapeResult {
  profileUrl?: string;
  subreddit?: string;
  postsFound: number;
  postsSaved: number;
  postsRelevant: number;
  averageScore?: number;
  postsSkipped?: number;
  errors?: string[];
}
