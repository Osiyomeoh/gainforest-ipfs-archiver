import { EcocertAttestation } from '../types/ecocert';

export const MOCK_ATTESTATIONS: Record<string, EcocertAttestation[]> = {
  '1-0x1234567890abcdef1234567890abcdef12345678-1': [
    {
      uid: 'att_001',
      schema_uid: 'schema_001',
      attester: '0xattester1234567890abcdef1234567890abcdef12',
      data: {
        chain_id: '1',
        token_id: '1',
        contract_address: '0x1234567890abcdef1234567890abcdef12345678',
        title: 'Forest Conservation Project',
        description: 'Carbon offset verification',
        sources: [
          { type: 'url', src: 'https://example.com/report1.pdf' },
          { type: 'url', src: 'https://example.com/data.json' }
        ]
      },
      creationBlockTimestamp: BigInt(Date.now())
    }
  ],
  '1-0x1234567890abcdef1234567890abcdef12345678-2': [
    {
      uid: 'att_002',
      schema_uid: 'schema_001',
      attester: '0xattester1234567890abcdef1234567890abcdef12',
      data: {
        chain_id: '1',
        token_id: '2',
        contract_address: '0x1234567890abcdef1234567890abcdef12345678',
        title: 'Biodiversity Monitoring',
        description: 'Species tracking and verification',
        sources: [
          { type: 'url', src: 'https://example.com/biodiversity.html' }
        ]
      },
      creationBlockTimestamp: BigInt(Date.now())
    }
  ]
};
