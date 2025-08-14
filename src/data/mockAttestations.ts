import { EcocertAttestation } from '../types/ecocert';

export const MOCK_ATTESTATIONS: Record<string, EcocertAttestation[]> = {
  '42220-0x16bA53B74c234C870c61EFC04cD418B8f2865959-86772003564839308183160524895100893921280': [
    {
      uid: '0x1db99dcee9d771379b08181b4f3615b8c66c82b2bd8468a7c289ef995ea134dd',
      schema_uid: '0x48e3e1be1e08084b408a7035ac889f2a840b440bbf10758d14fb722831a200c3',
      attester: '0xCf099CF2559764873c120970F1E4a2927799B9B1',
      data: {
        chain_id: '42220',
        token_id: '86772003564839308183160524895100893921280',
        contract_address: '0x16bA53B74c234C870c61EFC04cD418B8f2865959',
        title: 'Santa Helena do Ingles ongoing impact proof',
        description: 'Images of our Community members carrying out he biodiversity trails maintenance and deployment of bioacoustic recorders for Bird biodiversity monitoring and labeling',
        sources: [
          { type: 'url', src: 'https://drive.google.com/drive/folders/1HmlyhLpqO8HhejoaY6cuIXYhqMXEpBOg?usp=sharing' }
        ]
      },
      creationBlockTimestamp: BigInt(Date.now())
    }
  ]
}; 