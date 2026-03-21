import type { InvoiceStatus } from '../entities/invoice.entity';

export class InvoiceResponseDto {
  id!: string;
  tenantId!: string;
  periodStart!: string;
  periodEnd!: string;
  policiesCount!: number;
  totalPremium!: number;
  platformFee!: number;
  subscriptionFee!: number;
  amountDue!: number;
  isProRata!: boolean;
  daysActive!: number | null;
  pdfUrl!: string | null;
  status!: InvoiceStatus;
  createdAt!: string;
}
