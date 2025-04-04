import React from 'react';

interface TermsOfServiceProps {
  onAccept: () => void;
}

const TermsOfService: React.FC<TermsOfServiceProps> = ({ onAccept }) => {
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-gray-900 rounded-lg border border-purple-500/30 shadow-xl p-6 max-h-[80vh] overflow-y-auto">
        <h1 className="text-2xl font-bold text-green-400 mb-4 font-mono">Terms of Service</h1>
        
        <div className="text-gray-300 space-y-4 mb-6 text-sm">
          <p>
            Welcome to PODPLAYR! By using our dApp, you agree to these Terms of Service.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">1. Acceptance of Terms</h2>
          <p>
            By accessing or using PODPLAYR, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">2. Use License</h2>
          <p>
            Permission is granted to temporarily access the materials on PODPLAYR for personal, non-commercial use only. This is the grant of a license, not a transfer of title.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">3. NFT Content</h2>
          <p>
            PODPLAYR allows users to access and play NFT content. We do not claim ownership of any NFT content displayed on the platform. All rights to NFT content remain with the respective creators and owners.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">4. User Accounts</h2>
          <p>
            To access certain features of PODPLAYR, you may be required to connect your Farcaster account. You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">5. Privacy Policy</h2>
          <p>
            Your use of PODPLAYR is also governed by our Privacy Policy, which outlines how we collect, use, and protect your personal information.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">6. Limitation of Liability</h2>
          <p>
            PODPLAYR shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages resulting from your access to or use of, or inability to access or use, the service or any content provided on or through the service.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">7. Changes to Terms</h2>
          <p>
            PODPLAYR reserves the right to modify these terms at any time. We will provide notice of significant changes to the terms by posting an announcement on our platform.
          </p>
          
          <h2 className="text-lg text-purple-300 font-medium mt-4">8. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which PODPLAYR operates, without regard to its conflict of law provisions.
          </p>
        </div>
        
        <div className="flex justify-center mt-6">
          <button 
            onClick={onAccept}
            onTouchEnd={(e) => {
              e.preventDefault(); // Prevent default touch behavior
              onAccept();
            }}
            className="bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold py-4 px-10 rounded-full transition-colors duration-300 shadow-lg shadow-purple-600/30 touch-manipulation text-lg"
            style={{ WebkitTapHighlightColor: 'transparent' }} // Remove tap highlight on iOS
          >
            I Accept the Terms of Service
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
