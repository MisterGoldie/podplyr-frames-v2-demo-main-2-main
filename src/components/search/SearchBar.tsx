import { useState, useEffect, useContext } from 'react';
import Image from 'next/image';
import { FarcasterUser } from '../../types/user';
import { FarcasterContext } from '../../app/providers';
import { trackUserSearch } from '../../lib/firebase';

// Hardcoded list of FIDs for users who should have "thepod" badge
const POD_MEMBER_FIDS = [15019, 7472, 14871, 414859, 892616, 892130];

// PODPlayr official account FID
const PODPLAYR_OFFICIAL_FID = 1014485;

interface SearchBarProps {
  onSearch: (username: string) => void;
  isSearching: boolean;
  handleUserSelect?: (user: FarcasterUser) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isSearching, handleUserSelect }) => {
  const { fid: userFid = 0 } = useContext(FarcasterContext);
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
          const mappedSuggestions = data.result.users.map((user: any) => ({
            fid: user.fid,
            username: user.username,
            display_name: user.display_name || user.username,
            pfp_url: user.pfp_url || 'https://avatar.vercel.sh/' + user.username,
            follower_count: user.follower_count || 0,
            following_count: user.following_count || 0
          })).slice(0, 3);
          setSuggestions(mappedSuggestions);
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
      setSuggestions([]); // Clear suggestions after search
    }
  };

  const handleSuggestionClick = async (suggestion: FarcasterUser) => {
    setUsername(''); // Clear the input field
    setSuggestions([]); // Clear suggestions
    
    console.log('=== DIRECT WALLET SEARCH - BYPASSING ALL SEARCH RESULTS ===');
    
    // ONLY use the direct handler, never fall back to regular search
    if (handleUserSelect) {
      handleUserSelect(suggestion);
    }
    
    // Removed fallback to onSearch completely
  };

  return (
    <div className="w-full max-w-[90vw] mx-auto text-center">
      <div className="relative mt-4">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Explore Farcaster users.."
          className="w-full px-4 py-3 bg-transparent border-2 border-green-400/30 
                   rounded-full text-green-400 placeholder-green-400/50 
                   focus:outline-none focus:border-green-400 
                   transition-all duration-300 font-mono text-base"
          disabled={isSearching}
        />
      </div>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 mx-4 bg-gray-900/90 backdrop-blur-sm rounded-lg border border-green-400/30 max-h-60 overflow-y-auto z-10">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.fid}
              onClick={(e) => {
                e.preventDefault(); // Prevent any default behavior
                e.stopPropagation(); // Stop event bubbling
                handleSuggestionClick(suggestion);
              }}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-green-400/10 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 relative">
                <Image
                  src={suggestion.pfp_url || `https://avatar.vercel.sh/${suggestion.username}`}
                  alt={suggestion.display_name || suggestion.username || 'User avatar'}
                  className="object-cover"
                  fill
                  sizes="40px"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://avatar.vercel.sh/${suggestion.username}`;
                  }}
                />
              </div>
              <div className="flex-1">
                <div className="font-medium text-green-400">{suggestion.display_name || suggestion.username}</div>
                <div className="text-sm text-gray-400">@{suggestion.username}</div>
                {/* Badges row */}
                <div className="flex items-center gap-2 mt-1">
                  {POD_MEMBER_FIDS.includes(suggestion.fid) && (
                    <span className="text-xs font-mono px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full flex items-center">
                      thepod
                    </span>
                  )}
                  {suggestion.fid === PODPLAYR_OFFICIAL_FID && (
                    <span className="text-xs font-mono px-2 py-0.5 bg-purple-800/40 text-purple-300 rounded-full flex items-center font-semibold">
                      Official
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};