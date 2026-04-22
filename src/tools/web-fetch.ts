/**
 * Web Fetch Tool
 * Fetch content from URLs for AI analysis
 */

// Use native fetch (Node.js 18+)

export interface WebFetchInput {
  url: string;
  maxLength?: number;
  format?: 'text' | 'html' | 'json';
}

export interface WebSearchInput {
  query: string;
  maxResults?: number;
  mode?: 'full' | 'instant';
}

export class WebFetchTool {
  async fetch(input: WebFetchInput): Promise<{ 
    content: string; 
    url: string; 
    title?: string;
    contentType: string;
    length: number;
    truncated: boolean;
  }> {
    const maxLength = input.maxLength || 50000;
    
    try {
      const response = await fetch(input.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OMK-Bot/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'text/plain';
      let content: string;

      if (input.format === 'json' || contentType.includes('json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        content = await response.text();
      }

      let title: string | undefined;
      if (contentType.includes('html')) {
        const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].trim();
        }
        if (input.format === 'text') {
          content = content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      const originalLength = content.length;
      let truncated = false;

      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n\n... [Content truncated]';
        truncated = true;
      }

      return {
        content,
        url: input.url,
        title,
        contentType,
        length: originalLength,
        truncated,
      };
    } catch (err) {
      throw new Error(`Failed to fetch ${input.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async fetchGitHubRepo(url: string): Promise<{
    readme: string;
    languages: string[];
    description?: string;
    stars?: number;
  }> {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }

    const [, owner, repo] = match;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

    try {
      const repoResponse = await fetch(apiBase, {
        headers: { 'User-Agent': 'OMK-Bot/1.0' },
      });
      
      if (!repoResponse.ok) {
        throw new Error(`GitHub API error: ${repoResponse.status}`);
      }

      const repoData = await repoResponse.json() as any;

      let readme = '';
      try {
        const readmeResponse = await fetch(`${apiBase}/readme`, {
          headers: { 'User-Agent': 'OMK-Bot/1.0' },
        });
        if (readmeResponse.ok) {
          const readmeData = await readmeResponse.json() as any;
          readme = Buffer.from(readmeData.content, 'base64').toString('utf-8');
        }
      } catch {}

      let languages: string[] = [];
      try {
        const langResponse = await fetch(`${apiBase}/languages`, {
          headers: { 'User-Agent': 'OMK-Bot/1.0' },
        });
        if (langResponse.ok) {
          const langData = await langResponse.json() as any;
          languages = Object.keys(langData);
        }
      } catch {}

      return {
        readme: readme.slice(0, 10000),
        languages,
        description: repoData.description,
        stars: repoData.stargazers_count,
      };
    } catch (err) {
      throw new Error(`Failed to fetch GitHub repo: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async search(input: WebSearchInput): Promise<{
    query: string;
    results: Array<{ title: string; url: string; snippet: string; source?: string }>;
  }> {
    const maxResults = Math.max(1, Math.min(input.maxResults ?? 5, 10));
    if (input.mode !== 'instant') {
      try {
        const htmlResults = await this.searchDuckDuckGoHtml(input.query, maxResults);
        if (htmlResults.length > 0) {
          return { query: input.query, results: htmlResults };
        }
      } catch {
        // Fall back to the instant answer API below.
      }
      try {
        const bingResults = await this.searchBingHtml(input.query, maxResults);
        if (bingResults.length > 0) {
          return { query: input.query, results: bingResults };
        }
      } catch {
        // Fall back to the instant answer API below.
      }
    }

    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OMK-Bot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<any>;
    };

    const results: Array<{ title: string; url: string; snippet: string; source?: string }> = [];
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || input.query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
        source: 'duckduckgo-instant',
      });
    }

    const collect = (topics: Array<any>): void => {
      for (const topic of topics) {
        if (results.length >= maxResults) return;
        if (Array.isArray(topic.Topics)) {
          collect(topic.Topics);
          continue;
        }
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.FirstURL,
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'duckduckgo-instant',
          });
        }
      }
    };

    collect(data.RelatedTopics ?? []);
    return { query: input.query, results: results.slice(0, maxResults) };
  }

  private async searchDuckDuckGoHtml(query: string, maxResults: number): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
    const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OMK-Bot/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;

    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const url = this.decodeDuckDuckGoUrl(this.decodeHtml(match[1]));
      if (!url || url.startsWith('/')) continue;
      results.push({
        title: this.stripHtml(match[2]),
        url,
        snippet: this.stripHtml(match[3] ?? match[4] ?? ''),
        source: 'duckduckgo-html',
      });
    }

    return results;
  }

  private async searchBingHtml(query: string, maxResults: number): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
    const response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OMK-Bot/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    const resultRegex = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi;

    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const url = this.decodeHtml(match[1]);
      if (!url || url.startsWith('/')) continue;
      results.push({
        title: this.stripHtml(match[2]),
        url,
        snippet: this.stripHtml(match[3] ?? ''),
        source: 'bing-html',
      });
    }

    return results;
  }

  private decodeDuckDuckGoUrl(raw: string): string {
    try {
      const url = raw.startsWith('//') ? `https:${raw}` : raw;
      const parsed = new URL(url, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : parsed.href;
    } catch {
      return raw;
    }
  }

  private stripHtml(value: string): string {
    return this.decodeHtml(value.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtml(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }
}

let tool: WebFetchTool | null = null;

export function getWebFetchTool(): WebFetchTool {
  if (!tool) {
    tool = new WebFetchTool();
  }
  return tool;
}
