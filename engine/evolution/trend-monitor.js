// ============================================================
// TREND MONITOR — AI & Technology Trend Fetcher
// ============================================================
// Fetches latest AI/tech trends from Hacker News, GitHub Trending,
// and tech news RSS feeds. Filters for relevance to the agent ecosystem.

import { MemoryStore } from '../memory-store.js';

const RELEVANCE_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt', 'claude',
  'gemini', 'agent', 'autonomous', 'security', 'vulnerability', 'cve',
  'cybersecurity', 'devops', 'cloud', 'kubernetes', 'docker', 'react', 'next.js',
  'node.js', 'python', 'typescript', 'javascript', 'rust', 'go', 'web',
  'api', 'microservice', 'serverless', 'database', 'blockchain', 'quantum',
  'open source', 'framework', 'tooling', 'deployment', 'ci/cd', 'testing',
  'mcp', 'model context protocol', 'langchain', 'langgraph', 'openai', 'anthropic',
  'self-evolving', 'rag', 'retrieval', 'vector', 'embedding', 'fine-tuning'
];

export class TrendMonitor {
  constructor() {
    this.memory = new MemoryStore('evolution');
  }

  /**
   * Fetch all trends from multiple sources
   */
  async fetchAllTrends() {
    const allTrends = [];

    try {
      // Source 1: Hacker News Top Stories
      const hnTrends = await this._fetchHackerNews();
      allTrends.push(...hnTrends);
    } catch (err) {
      console.error(`HN fetch failed: ${err.message}`);
    }

    try {
      // Source 2: GitHub Trending
      const ghTrends = await this._fetchGitHubTrending();
      allTrends.push(...ghTrends);
    } catch (err) {
      console.error(`GitHub trending fetch failed: ${err.message}`);
    }

    // Filter for relevance
    const relevant = allTrends.filter(t => this._isRelevant(t));

    // Store in memory
    this.memory.evolve('trends', {
      fetchedAt: new Date().toISOString(),
      totalFetched: allTrends.length,
      relevantCount: relevant.length,
      trends: relevant.slice(0, 50) // Cap at 50
    });

    return relevant;
  }

  /**
   * Fetch Hacker News top stories
   */
  async _fetchHackerNews() {
    const trends = [];

    try {
      const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      if (!topRes.ok) return trends;
      const topIds = await topRes.json();

      // Fetch top 30 stories
      const storyPromises = topIds.slice(0, 30).map(async (id) => {
        try {
          const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          if (!res.ok) return null;
          return await res.json();
        } catch { return null; }
      });

      const stories = (await Promise.allSettled(storyPromises))
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

      for (const story of stories) {
        if (!story.title) continue;
        trends.push({
          title: story.title,
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          source: 'Hacker News',
          score: story.score || 0,
          timestamp: new Date((story.time || 0) * 1000).toISOString(),
          relevance: this._calculateRelevance(story.title)
        });
      }
    } catch (err) {
      console.error(`HN API error: ${err.message}`);
    }

    return trends;
  }

  /**
   * Fetch GitHub trending repositories (via API search for recently created popular repos)
   */
  async _fetchGitHubTrending() {
    const trends = [];

    try {
      // Search for recently created popular repos
      const date = new Date();
      date.setDate(date.getDate() - 7);
      const since = date.toISOString().split('T')[0];

      const res = await fetch(
        `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=20`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AI-WORKSPACE-TrendMonitor'
          }
        }
      );

      if (!res.ok) return trends;
      const data = await res.json();

      for (const repo of (data.items || [])) {
        trends.push({
          title: `${repo.full_name}: ${repo.description || 'No description'}`,
          url: repo.html_url,
          source: 'GitHub Trending',
          score: repo.stargazers_count || 0,
          language: repo.language,
          timestamp: repo.created_at,
          relevance: this._calculateRelevance(`${repo.full_name} ${repo.description || ''} ${repo.language || ''}`)
        });
      }
    } catch (err) {
      console.error(`GitHub API error: ${err.message}`);
    }

    return trends;
  }

  /**
   * Calculate relevance score for a trend
   */
  _calculateRelevance(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const keyword of RELEVANCE_KEYWORDS) {
      if (lower.includes(keyword)) score += 10;
    }
    return Math.min(100, score);
  }

  /**
   * Check if a trend is relevant to the agent ecosystem
   */
  _isRelevant(trend) {
    return (trend.relevance || 0) >= 10;
  }

  /**
   * Get cached trends from memory
   */
  getCachedTrends() {
    return this.memory.recallRecent('trends', 5);
  }
}

export default TrendMonitor;
