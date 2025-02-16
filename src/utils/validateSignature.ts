import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

export async function validateSignature(
  header: string,
  payload: string,
  signature: string
): Promise<boolean> {
  try {
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    const message = `${header}.${payload}`;
    const messageBytes = Buffer.from(message);
    const signatureBytes = Buffer.from(signature, 'base64url');

    // Verify the signature using viem
    const valid = await publicClient.verifyMessage({
      address: decodedHeader.signer as `0x${string}`,
      message: messageBytes,
      signature: signatureBytes as `0x${string}`,
    });

    return valid;
  } catch (error) {
    console.error('Error validating signature:', error);
    return false;
  }
}
