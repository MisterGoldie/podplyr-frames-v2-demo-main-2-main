import React from 'react';
import type { NFT } from '../../types/user';

interface InfoPanelProps {
  nft: NFT;
  onClose: () => void;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ nft, onClose }) => {
  // Copy the exact InfoPanel UI from the original Player component
  return (
    <div className="fixed inset-0 bg-black/90 z-[200] backdrop-blur-sm p-4 overflow-auto">
      <div className="container mx-auto max-w-2xl">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>
        
        <h2 className="text-xl font-mono text-purple-400 mt-8 mb-4">NFT Information</h2>
        
        <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
          <h3 className="text-white font-mono text-md mb-2">Name</h3>
          <p className="text-gray-300 font-mono text-sm mb-4">{nft.name}</p>
          
          {nft.metadata?.description && (
            <>
              <h3 className="text-white font-mono text-md mb-2">Description</h3>
              <p className="text-gray-300 font-mono text-sm mb-4 whitespace-pre-line">{nft.metadata.description}</p>
            </>
          )}
          
          <h3 className="text-white font-mono text-md mb-2">Contract Address</h3>
          <p className="text-gray-300 font-mono text-sm mb-4 break-all">{nft.contract}</p>
          
          <h3 className="text-white font-mono text-md mb-2">Token ID</h3>
          <p className="text-gray-300 font-mono text-sm mb-4 break-all">{nft.tokenId}</p>
          
          {nft.metadata?.attributes && nft.metadata.attributes.length > 0 && (
            <>
              <h3 className="text-white font-mono text-md mb-2">Attributes</h3>
              <div className="grid grid-cols-2 gap-2">
                {nft.metadata.attributes.map((attr, index) => (
                  <div key={index} className="bg-gray-800/50 p-2 rounded">
                    <p className="text-purple-400 font-mono text-xs">{attr.trait_type}</p>
                    <p className="text-gray-300 font-mono text-sm truncate">{attr.value}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InfoPanel; 