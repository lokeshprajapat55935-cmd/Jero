export interface SearchResultItem {
  type: 'category' | 'worker';
  id: string;
  title: string;
  slug?: string;
  icon?: string | null;
  category?: string;
  price?: number;
  rating?: number;
  avatar_url?: string | null;
  location?: string;
}

export interface TrendingItem {
  id: string;
  title: string;
  slug: string;
  icon: string;
}

export const searchApi = {
  /**
   * Fetch search results from backend API
   */
  async search(query: string): Promise<SearchResultItem[]> {
    if (!query.trim()) return [];
    
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      
      const json = await res.json();
      return json.data?.results || [];
    } catch (error) {
      console.error('Error fetching search results:', error);
      throw error;
    }
  },

  /**
   * Fetch trending services
   */
  async getTrending(): Promise<TrendingItem[]> {
    try {
      const res = await fetch('/api/search/trending');
      if (!res.ok) throw new Error('Trending failed');
      
      const json = await res.json();
      return json.data?.trending || [];
    } catch (error) {
      console.error('Error fetching trending services:', error);
      return [];
    }
  },

  /**
   * Fire-and-forget log search query
   */
  async logSearch(query: string): Promise<void> {
    if (!query.trim()) return;
    try {
      fetch('/api/search/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        // Avoid keeping the client waiting
        keepalive: true,
      });
    } catch (e) {
      // Ignore errors for background logging
    }
  },
  
  /**
   * Local storage management for recent searches
   */
  getRecentSearches(): string[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('zolvo_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  addRecentSearch(query: string) {
    if (typeof window === 'undefined' || !query.trim()) return;
    try {
      const recent = this.getRecentSearches();
      // Remove if exists to push to front
      const filtered = recent.filter(q => q.toLowerCase() !== query.toLowerCase());
      filtered.unshift(query.trim());
      // Keep only top 5
      localStorage.setItem('zolvo_recent_searches', JSON.stringify(filtered.slice(0, 5)));
    } catch (e) {
      console.error('Failed to save recent search');
    }
  },

  clearRecentSearches() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('zolvo_recent_searches');
  }
};
