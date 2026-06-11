import { useState, useEffect, useRef, useCallback } from 'react';
import { searchApi, SearchResultItem, TrendingItem } from '@/services/search.api';

// Simple in-memory cache to prevent re-fetching on backspace
const searchCache = new Map<string, SearchResultItem[]>();

export function useSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Load initial data (recent & trending)
  useEffect(() => {
    setRecent(searchApi.getRecentSearches());
    searchApi.getTrending().then(setTrending);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!window.navigator.onLine) setIsOffline(true);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Debounce logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch logic based on debounced query
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    if (isOffline) {
      setError('You are offline.');
      setIsLoading(false);
      return;
    }

    const fetchResults = async () => {
      // Check cache first
      if (searchCache.has(debouncedQuery)) {
        setResults(searchCache.get(debouncedQuery)!);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        const data = await searchApi.search(debouncedQuery);
        searchCache.set(debouncedQuery, data);
        setResults(data);
      } catch (err) {
        setError('Failed to load results. Please try again.');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [debouncedQuery, isOffline]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (text.trim() && !searchCache.has(text.trim())) {
      setIsLoading(true); // Optimistic loading state before debounce hits
    }
  };

  const handleSearchCommit = useCallback((finalQuery: string) => {
    if (finalQuery.trim()) {
      searchApi.logSearch(finalQuery);
      searchApi.addRecentSearch(finalQuery);
      setRecent(searchApi.getRecentSearches());
    }
  }, []);

  const clearRecent = useCallback(() => {
    searchApi.clearRecentSearches();
    setRecent([]);
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    debouncedQuery,
    results,
    trending,
    recent,
    isLoading,
    error,
    isOffline,
    handleSearchCommit,
    clearRecent,
  };
}
