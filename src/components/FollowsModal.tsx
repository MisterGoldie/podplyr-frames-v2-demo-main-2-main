'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { subscribeToFollowers, subscribeToFollowingUsers, toggleFollowUser, isUserFollowed } from '../lib/firebase';
import type { FollowedUser, FarcasterUser } from '../types/user';

interface FollowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userFid: number;
  type: 'followers' | 'following';
  currentUserFid: number;
}

const FollowsModal: React.FC<FollowsModalProps> = ({
  isOpen,
  onClose,
  userFid,
  type,
  currentUserFid
}) => {
  const [users, setUsers] = useState<FollowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState<Record<number, boolean>>({});
  const [processingFollow, setProcessingFollow] = useState<Record<number, boolean>>({});
  
  // Load users based on type (followers or following)
  useEffect(() => {
    if (!isOpen || !userFid) return;
    
    setLoading(true);
    let unsubscribe: () => void;
    
    if (type === 'followers') {
      unsubscribe = subscribeToFollowers(userFid, (followers) => {
        setUsers(followers);
        setLoading(false);
      });
    } else {
      unsubscribe = subscribeToFollowingUsers(userFid, (following) => {
        setUsers(following);
        setLoading(false);
      });
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isOpen, userFid, type]);
  
  // Update follow status for each user when the list changes
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!currentUserFid || users.length === 0) return;
      
      const statusMap: Record<number, boolean> = {};
      
      // Check follow status for each user
      await Promise.all(users.map(async (user) => {
        if (user.fid === currentUserFid) return; // Skip self
        const isFollowed = await isUserFollowed(currentUserFid, user.fid);
        statusMap[user.fid] = isFollowed;
      }));
      
      setFollowStatus(statusMap);
    };
    
    checkFollowStatus();
  }, [users, currentUserFid]);
  
  const handleToggleFollow = async (user: FollowedUser) => {
    if (!currentUserFid || user.fid === currentUserFid) return;
    
    try {
      // Mark this user as processing to prevent multiple clicks
      setProcessingFollow(prev => ({ ...prev, [user.fid]: true }));
      
      // Convert FollowedUser to FarcasterUser format
      const farcasterUser: FarcasterUser = {
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url,
        follower_count: 0,    // Default value as we don't have this info
        following_count: 0     // Default value as we don't have this info
      };
      
      // Toggle follow status
      const newStatus = await toggleFollowUser(currentUserFid, farcasterUser);
      
      // Update local state immediately
      setFollowStatus(prev => ({
        ...prev,
        [user.fid]: newStatus
      }));
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      // Clear processing state
      setProcessingFollow(prev => ({ ...prev, [user.fid]: false }));
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-black/90 border border-purple-500/30 rounded-xl w-[90%] max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20">
          <h3 className="text-xl font-mono text-purple-300 font-medium">
            {type === 'followers' ? 'Followers' : 'Following'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-purple-500/10 text-purple-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {/* User List */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-10 h-10 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-purple-300/70 font-mono text-sm">Loading...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-purple-300/70 font-mono">
                {type === 'followers' ? 'No followers yet' : 'Not following anyone'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-purple-500/10">
              {users.map((user) => (
                <li key={user.fid} className="px-4 py-3 hover:bg-purple-500/5">
                  <div className="flex items-center justify-between">
                    <a
                      href={`https://warpcast.com/${user.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center flex-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="h-10 w-10 rounded-full overflow-hidden mr-3">
                        <Image
                          src={user.pfp_url || '/default-avatar.png'}
                          alt={user.username || 'User profile picture'}
                          width={40}
                          height={40}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-purple-200">
                          {user.display_name}
                        </div>
                        <div className="text-sm text-purple-400">
                          @{user.username}
                        </div>
                      </div>
                    </a>
                    
                    {currentUserFid !== user.fid && (
                      <button
                        onClick={() => handleToggleFollow(user)}
                        disabled={processingFollow[user.fid]}
                        className={`ml-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${followStatus[user.fid] 
                          ? 'bg-purple-700/30 hover:bg-purple-700/40 text-purple-300' 
                          : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300'} ${
                            processingFollow[user.fid] ? 'opacity-70 cursor-not-allowed' : ''
                          }`}
                      >
                        {processingFollow[user.fid] ? (
                          <span className="flex items-center">
                            <span className="w-3 h-3 mr-1 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin"></span>
                          </span>
                        ) : followStatus[user.fid] ? (
                          'Following'
                        ) : (
                          'Follow'
                        )}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default FollowsModal;
