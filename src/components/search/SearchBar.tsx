import { useState, useEffect } from 'react';
import Image from 'next/image';
import { FarcasterUser } from '../../types/user';

interface SearchBarProps {
  onSearch: (username: string) => void;
  isSearching: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isSearching }) => {
  const [username, setUsername] = useState('');
  const [suggestions, setSuggestions] = useState<FarcasterUser[]>([]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (username.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const neynarKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
        if (!neynarKey) return;

        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(username)}`,
          {
            headers: {
              'accept': 'application/json',
              'api_key': neynarKey
            }
          }
        );

        const data = await response.json();
        if (data.result?.users) {
          setSuggestions(data.result.users.slice(0, 3));
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [username]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onSearch(username.trim());
    }
  };

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Search users..."
          className="w-full bg-gray-800/50 backdrop-blur-sm text-green-400 placeholder-gray-500 rounded-lg py-2 px-4 pr-10 font-mono focus:outline-none focus:ring-2 focus:ring-green-400/50"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 hover:text-green-300 transition-colors"
          disabled={isSearching}
        >
          {isSearching ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
              <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
            </svg>
          )}
        </button>
      </form>

      {/* Suggestions Dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute w-full mt-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg z-10">
          {suggestions.map((user) => (
            <button
              key={user.fid}
              onClick={() => {
                setUsername(user.username);
                setSuggestions([]);
                onSearch(user.username);
              }}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-700/50 transition-colors text-left"
            >
              {user.pfp_url ? (
                <Image
                  src={user.pfp_url}
                  alt={user.display_name || user.username}
                  className="w-8 h-8 rounded-full"
                  width={32}
                  height={32}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-green-400 font-mono text-sm">
                  {(user.display_name || user.username).charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-mono text-green-400 text-sm">{user.display_name || user.username}</div>
                <div className="font-mono text-gray-400 text-xs">@{user.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};