/**
 * Web Fetch Tool
 * Fetch content from URLs for AI analysis
 */

import { fetch } from 'undici';

export interface WebFetchInput {
  url: string;
  maxLength?: number;
  format?: 'text' | 'html' | 'json';
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

      // Extract title from HTML
      let title: string | undefined;
      if (contentType.includes('html')) {
        const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].trim();
        }
        // Strip HTML tags for text format
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

  /**
   * Fetch GitHub repository README and basic info
   */
  async fetchGitHubRepo(url: string): Promise<{
    readme: string;
    languages: string[];
    description?: string;
    stars?: number;
  }> {
    // Convert GitHub URL to API URL
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }

    const [, owner, repo] = match;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

    try {
      // Fetch repo info
      const repoResponse = await fetch(apiBase, {
        headers: { 'User-Agent': 'OMK-Bot/1.0' },
      });
      
      if (!repoResponse.ok) {
        throw new Error(`GitHub API error: ${repoResponse.status}`);
      }

      const repoData = await repoResponse.json() as any;

      // Fetch README
      let readme = '';
      try {
        const readmeResponse = await fetch(`${apiBase}/readme`, {
          headers: { 'User-Agent': 'OMK-Bot/1.0' },
        });
        if (readmeResponse.ok) {
          const readmeData = await readmeResponse.json() as any;
          readme = Buffer.from(readmeData.content, 'base64').toString('utf-8');
        }
      } catch {
        // README is optional
      }

      // Fetch languages
      let languages: string[] = [];
      try {
        const langResponse = await fetch(`${apiBase}/languages`, {
          headers: { 'User-Agent': 'OMK-Bot/1.0' },
        });
        if (langResponse.ok) {
          const langData = await langResponse.json() as any;
          languages = Object.keys(langData);
        }
      } catch {
        // Languages are optional
      }

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
}

let tool: WebFetchTool | null = null;

export function getWebFetchTool(): WebFetchTool {
  if (!tool) {
    tool = new WebFetchTool();
  }
  return tool;
}
