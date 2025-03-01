import React from 'react';
import { useNFTPlayCount } from '../../hooks/useNFTPlayCount';
import { useNFTLikes } from '../../hooks/useNFTLikes';
import { useNFTTopPlayed } from '../../hooks/useNFTTopPlayed';
import type { NFT } from '../../types/user';

interface InfoPanelProps {
  nft: NFT;
  onClose: () => void;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ nft, onClose }) => {
  const { playCount, loading } = useNFTPlayCount(nft);
  const { likesCount, isLoading: likesLoading } = useNFTLikes(nft);
  const { hasBeenInTopPlayed, loading: topPlayedLoading } = useNFTTopPlayed(nft);

  return (
    <div className="fixed bottom-40 left-0 right-0 mx-auto z-[101] max-w-sm px-4">
      <div className="bg-gray-900/95 backdrop-blur-lg rounded-xl p-5 shadow-2xl border border-purple-400/30 animate-fadeIn w-full">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h2 className="text-purple-300 font-mono text-base font-semibold">{nft.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                  <path d="M320-200v-560l440 280-440 280Z"/>
                </svg>
                <span className="text-purple-300 text-xs font-mono">
                  {loading ? '...' : `${playCount} plays`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                    <path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"/>
                  </svg>
                  <span className="text-purple-300 text-xs font-mono">
                    {likesLoading ? '...' : `${likesCount} likes`}
                  </span>
                </div>
                {!topPlayedLoading && hasBeenInTopPlayed && (
                  <div className="flex items-center gap-1.5 bg-purple-500/10 px-2 py-0.5 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 -960 960 960" width="14" fill="currentColor" className="text-purple-400">
                      <path d="m233-80 65-281L80-550l288-25 112-265 112 265 288 25-218 189 65 281-247-149L233-80Z"/>
                    </svg>
                    <span className="text-purple-300 text-xs font-mono">Top Played</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-purple-300 active:scale-95 transition-all p-3 -mr-3 touch-manipulation rounded-full bg-black/20 backdrop-blur-sm"
            style={{ touchAction: 'manipulation' }}
            aria-label="Close info panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
              <path d="M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div 
          className="space-y-4 max-h-[40vh] overflow-y-auto overscroll-contain will-change-scroll pr-2"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(168, 85, 247, 0.4) rgba(0, 0, 0, 0.2)',
            WebkitOverflowScrolling: 'touch',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden'
          }}
        >
          {/* Description */}
          {(nft.description || nft.metadata?.description) && (
            <div className="bg-black/30 rounded-lg p-3 border border-purple-400/10">
              <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Description</h3>
              <p className="text-gray-300 text-sm leading-relaxed break-words">{nft.description || nft.metadata?.description}</p>
            </div>
          )}

          {/* Contract and Token ID */}
          <div className="bg-black/30 rounded-lg p-3 border border-purple-400/10 overflow-hidden space-y-3">
            {/* Contract */}
            <div>
              <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Contract</h3>
              <div className="flex items-center gap-2">
                <p className="text-gray-300 text-sm font-mono break-all">{nft.contract}</p>
                <button 
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                  onClick={() => navigator.clipboard.writeText(nft.contract)}
                  title="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                    <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
                  </svg>
                </button>
              </div>
            </div>
            {/* Token ID */}
            <div>
              <h3 className="text-purple-300 font-mono text-xs uppercase tracking-wider mb-2">Token ID</h3>
              <div className="flex items-center gap-2">
                <p className="text-gray-300 text-sm font-mono break-all">{nft.tokenId}</p>
                <button 
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                  onClick={() => navigator.clipboard.writeText(nft.tokenId || '')}
                  title="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 -960 960 960" width="16" fill="currentColor">
                    <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel; 