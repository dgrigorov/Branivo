export interface BatchPdfJobPayload {
  exportId: string;
  policyId: string;
  tenantId: string;
}

export interface BatchPdfAssemblePayload {
  exportId: string;
  tenantId: string;
}

export const BATCH_PDF_JOB_NAME = 'generate-batch-pdf' as const;
