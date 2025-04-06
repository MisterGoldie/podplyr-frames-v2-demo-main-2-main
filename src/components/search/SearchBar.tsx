import { useState, useEffect, useContext } from 'react';
import Image from 'next/image';
import { FarcasterUser } from '../../types/user';
import { FarcasterContext } from '../../app/providers';
import { trackUserSearch } from '../../lib/firebase';

// Hardcoded list of FIDs for users who should have "thepod" badge
const POD_MEMBER_FIDS = [15019, 7472, 14871, 414859, 892616, 892130];

// PODPLAYR official account FID
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
        // Use a safer approach that avoids CORS issues
        // Instead of direct API calls, use Firebase functions that are already imported
        const { trackUserSearch } = await import('../../lib/firebase');
        
        // IMPORTANT: We need to search for users WITHOUT tracking the search
        // We'll use searchUsers instead of trackUserSearch to avoid adding to recently searched
        const { searchUsers } = await import('../../lib/firebase');
        
        // Search for users without tracking the search in recently searched
        const users = await searchUsers(username);
        
        if (users && users.length > 0) {
          // Use the first matching user as a suggestion
          const user = users[0];
          const suggestion = {
            fid: user.fid,
            username: user.username,
            display_name: user.display_name || user.username,
            pfp_url: user.pfp_url || 'https://avatar.vercel.sh/' + user.username,
            follower_count: user.follower_count || 0,
            following_count: user.following_count || 0
          };
          
          setSuggestions([suggestion]);
        } else {
          // Use hardcoded suggestions for common searches to avoid API calls
          const commonUsers = [
            {
              fid: 1014485, // PODPLAYR_OFFICIAL_FID
              username: 'podplayr',
              display_name: 'PODPlayr',
              pfp_url: 'https://i.imgur.com/XqQZ3Kc.png',
              follower_count: 1000,
              following_count: 100
            },
            {
              fid: 15019, // A POD_MEMBER_FID
              username: 'thepod',
              display_name: 'The Pod',
              pfp_url: 'https://avatar.vercel.sh/thepod',
              follower_count: 500,
              following_count: 200
            }
          ];
          
          // Filter common users by the search term
          const filteredUsers = commonUsers.filter(user => 
            user.username.toLowerCase().includes(username.toLowerCase()) ||
            user.display_name.toLowerCase().includes(username.toLowerCase())
          );
          
          setSuggestions(filteredUsers.length > 0 ? filteredUsers : []);
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
        setSuggestions([]);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [username, userFid]);

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
                  {[7472, 14871, 414859, 356115, 296462, 195864, 1020224, 1020659].includes(suggestion.fid) && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full flex items-center font-semibold" 
                          style={{ 
                            background: 'linear-gradient(90deg, rgba(255,0,0,0.2) 0%, rgba(255,154,0,0.2) 25%, rgba(208,222,33,0.2) 50%, rgba(79,220,74,0.2) 75%, rgba(63,218,216,0.2) 100%)', 
                            color: '#f0f0f0',
                            textShadow: '0 0 2px rgba(0,0,0,0.5)'
                          }}>
                      ACYL
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