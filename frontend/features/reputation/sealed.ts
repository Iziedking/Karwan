import type { ReputationResponse, SealedReasonCode, SealedReputation } from '../../core/api';
import type { SealedRecordCopy } from '../../shared/i18n/messages/sealedRecord';

export function isSealedReputation(response: ReputationResponse): response is SealedReputation {
  return (response as SealedReputation).sealed === true;
}

export function reasonLabels(codes: SealedReasonCode[], copy: SealedRecordCopy): string[] {
  return codes.map((code) => copy.reasons[code]);
}

export function reasonLine(codes: SealedReasonCode[], copy: SealedRecordCopy): string {
  return reasonLabels(codes, copy).join(' · ');
}
