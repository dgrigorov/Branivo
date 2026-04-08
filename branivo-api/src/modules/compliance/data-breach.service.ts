import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { AuditService } from '../../common/audit/audit.service';
import { EmailService } from '../../infrastructure/email/email.service';
import {
  DataBreach,
  BreachSeverity,
  BreachStatus,
} from './entities/data-breach.entity';
import { ReportDataBreachDto } from './dto/report-data-breach.dto';
import { UpdateDataBreachDto } from './dto/update-data-breach.dto';
import { DataBreachResponseDto } from './dto/data-breach-response.dto';
import { DataBreachStatsResponseDto } from './dto/data-breach-stats-response.dto';
import { ListDataBreachesDto } from './dto/list-data-breaches.dto';

export type BreachAlertType =
  | 'data-breach-reported'
  | 'data-breach-24h-warning'
  | 'data-breach-8h-urgent'
  | 'data-breach-overdue';

const SPECIAL_CATEGORY_DATA = ['egn', 'health_data'] as const;
const SEVERITY_ORDER: BreachSeverity[] = ['low', 'medium', 'high', 'critical'];

function elevateSeverity(
  current: BreachSeverity,
  minimum: BreachSeverity,
): BreachSeverity {
  const currentIdx = SEVERITY_ORDER.indexOf(current);
  const minimumIdx = SEVERITY_ORDER.indexOf(minimum);
  return currentIdx >= minimumIdx ? current : minimum;
}

function hoursUntilDate(target: Date, now: Date): number {
  return Math.max(
    0,
    Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60)),
  );
}

@Injectable()
export class DataBreachService {
  private readonly logger = new Logger(DataBreachService.name);

  constructor(
    @InjectRepository(DataBreach)
    private readonly repo: Repository<DataBreach>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async reportBreach(
    dto: ReportDataBreachDto,
    userId: string,
  ): Promise<DataBreachResponseDto> {
    const detectedAt = new Date(dto.detectedAt);

    if (detectedAt > new Date()) {
      throw new BadRequestException({
        error: 'INVALID_DETECTED_AT',
        message: 'detectedAt cannot be in the future',
      });
    }

    if (dto.tenantId) {
      const tenant = await this.dataSource.query<{ id: string }[]>(
        `SELECT id FROM tenants WHERE id = $1`,
        [dto.tenantId],
      );
      if (tenant.length === 0) {
        throw new NotFoundException('Tenant not found');
      }
    }

    let severity = dto.severity;
    let severityAutoElevated = false;
    const hasSpecialCategory = dto.affectedDataCategories.some((c) =>
      (SPECIAL_CATEGORY_DATA as readonly string[]).includes(c),
    );
    if (hasSpecialCategory) {
      const elevated = elevateSeverity(severity, 'high');
      if (elevated !== severity) {
        severity = elevated;
        severityAutoElevated = true;
      }
    }

    const kzldNotificationRequired = dto.kzldNotificationRequired ?? true;
    const kzldNotificationDeadline = new Date(
      detectedAt.getTime() + 72 * 60 * 60 * 1000,
    );

    const breach = await this.repo.save({
      tenantId: dto.tenantId ?? null,
      title: dto.title,
      description: dto.description,
      breachType: dto.breachType,
      severity,
      detectedAt,
      reportedBy: userId,
      affectedDataCategories: dto.affectedDataCategories,
      affectedSubjectsCount: dto.affectedSubjectsCount ?? null,
      affectedSubjectsDescription: dto.affectedSubjectsDescription ?? null,
      kzldNotificationRequired,
      kzldNotificationDeadline,
      clientNotificationRequired: dto.clientNotificationRequired ?? false,
      status: 'detected' as BreachStatus,
    });

    await this.auditService.log({
      tenantId: breach.tenantId ?? 'platform',
      userId,
      action: 'data_breach.reported',
      entityType: 'data_breach',
      entityId: breach.id,
    });

    if (kzldNotificationRequired) {
      await this.sendBreachAlert('data-breach-reported', breach);
    }

    return this.toDto(breach, severityAutoElevated);
  }

  async updateBreach(
    id: string,
    dto: UpdateDataBreachDto,
    userId: string,
  ): Promise<DataBreachResponseDto> {
    const breach = await this.repo.findOne({ where: { id } });
    if (!breach) {
      throw new NotFoundException('Data breach not found');
    }

    const changedFields: string[] = [];

    if (dto.status !== undefined) {
      breach.status = dto.status;
      changedFields.push('status');

      if (dto.status === 'closed' && !breach.closedAt) {
        breach.closedAt = dto.closedAt ? new Date(dto.closedAt) : new Date();
        changedFields.push('closedAt');
      }
    }

    if (dto.kzldNotifiedAt !== undefined) {
      breach.kzldNotifiedAt = new Date(dto.kzldNotifiedAt);
      changedFields.push('kzldNotifiedAt');
    }

    if (dto.kzldNotificationReference !== undefined) {
      breach.kzldNotificationReference = dto.kzldNotificationReference;
      changedFields.push('kzldNotificationReference');
    }

    if (dto.containmentActions !== undefined) {
      breach.containmentActions = dto.containmentActions;
      changedFields.push('containmentActions');
    }

    if (dto.remediationActions !== undefined) {
      breach.remediationActions = dto.remediationActions;
      changedFields.push('remediationActions');
    }

    if (dto.clientNotificationRequired !== undefined) {
      breach.clientNotificationRequired = dto.clientNotificationRequired;
      changedFields.push('clientNotificationRequired');
    }

    if (dto.clientNotificationSentAt !== undefined) {
      breach.clientNotificationSentAt = new Date(dto.clientNotificationSentAt);
      changedFields.push('clientNotificationSentAt');
    }

    if (dto.lessonsLearned !== undefined) {
      breach.lessonsLearned = dto.lessonsLearned;
      changedFields.push('lessonsLearned');
    }

    if (dto.closedAt !== undefined && !changedFields.includes('closedAt')) {
      breach.closedAt = new Date(dto.closedAt);
      changedFields.push('closedAt');
    }

    const updated = await this.repo.save(breach);

    await this.auditService.log({
      tenantId: breach.tenantId ?? 'platform',
      userId,
      action: 'data_breach.updated',
      entityType: 'data_breach',
      entityId: breach.id,
      metadata: { changedFields },
    });

    return this.toDto(updated);
  }

  async getBreaches(query: ListDataBreachesDto): Promise<{
    items: DataBreachResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('db')
      .orderBy('db.detectedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('db.status = :status', { status: query.status });
    }

    if (query.tenantId) {
      qb.andWhere('db.tenantId = :tenantId', { tenantId: query.tenantId });
    }

    if (query.severity) {
      qb.andWhere('db.severity = :severity', { severity: query.severity });
    }

    const [breaches, total] = await qb.getManyAndCount();
    const items = breaches.map((b) => this.toDto(b));

    return { items, total, page, limit };
  }

  async getBreachById(id: string): Promise<DataBreachResponseDto> {
    const breach = await this.repo.findOne({ where: { id } });
    if (!breach) {
      throw new NotFoundException('Data breach not found');
    }
    return this.toDto(breach);
  }

  async getStats(): Promise<DataBreachStatsResponseDto> {
    const rows = await this.repo.find();
    const now = new Date();

    const total = rows.length;
    const last30DaysThreshold = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    const byStatus: Record<BreachStatus, number> = {
      detected: 0,
      investigating: 0,
      contained: 0,
      notified_kzld: 0,
      notified_clients: 0,
      closed: 0,
    };

    const bySeverity: Record<BreachSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let overdueCount = 0;
    let approachingDeadlineCount = 0;
    let last30Days = 0;
    let closedTotal = 0;
    let closedCompliant = 0;

    for (const b of rows) {
      byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
      bySeverity[b.severity] = (bySeverity[b.severity] ?? 0) + 1;

      if (b.createdAt >= last30DaysThreshold) {
        last30Days += 1;
      }

      if (b.status === 'closed') {
        closedTotal += 1;
        const isCompliant =
          !b.kzldNotificationRequired ||
          (b.kzldNotifiedAt !== null &&
            b.kzldNotifiedAt <= b.kzldNotificationDeadline);
        if (isCompliant) closedCompliant += 1;
      }

      if (
        b.kzldNotificationRequired &&
        b.kzldNotifiedAt === null &&
        b.status !== 'closed'
      ) {
        if (b.kzldNotificationDeadline < now) {
          overdueCount += 1;
        } else if (hoursUntilDate(b.kzldNotificationDeadline, now) <= 24) {
          approachingDeadlineCount += 1;
        }
      }
    }

    const complianceRate = closedTotal > 0 ? closedCompliant / closedTotal : 1;

    return {
      total,
      byStatus,
      bySeverity,
      overdueCount,
      approachingDeadlineCount,
      last30Days,
      complianceRate,
    };
  }

  async getBrokerBreaches(tenantId: string): Promise<DataBreachResponseDto[]> {
    const breaches = await this.repo.find({
      where: { tenantId },
      order: { detectedAt: 'DESC' },
    });
    return breaches.map((b) => this.toDto(b));
  }

  async getPendingAlertBreaches(): Promise<DataBreach[]> {
    return this.repo
      .createQueryBuilder('db')
      .where('db.kzldNotificationRequired = true')
      .andWhere('db.kzldNotifiedAt IS NULL')
      .andWhere("db.status NOT IN ('closed')")
      .getMany();
  }

  async sendBreachAlert(
    alertType: BreachAlertType,
    breach: DataBreach,
  ): Promise<void> {
    const adminEmail =
      this.config.get<string>('SUPER_ADMIN_EMAIL') ?? 'admin@branivo.com';

    const deadlineStr = breach.kzldNotificationDeadline.toLocaleString(
      'bg-BG',
      {
        timeZone: 'Europe/Sofia',
      },
    );
    const detectedStr = breach.detectedAt.toLocaleString('bg-BG', {
      timeZone: 'Europe/Sofia',
    });

    const safeTitle = breach.title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const subjectMap: Record<BreachAlertType, string> = {
      'data-breach-reported': `[BRANIVO] Нов GDPR инцидент регистриран: ${breach.title}`,
      'data-breach-24h-warning': `[BRANIVO] ⚠️ GDPR Breach: 24 часа до КЗЛД deadline — ${breach.title}`,
      'data-breach-8h-urgent': `[BRANIVO] 🚨 URGENT: 8 часа до КЗЛД deadline — ${breach.title}`,
      'data-breach-overdue': `[BRANIVO] ❌ ПРОСРОЧЕН КЗЛД срок за: ${breach.title}`,
    };

    const html = `
      <h2>${subjectMap[alertType]}</h2>
      <table>
        <tr><td><strong>Инцидент:</strong></td><td>${safeTitle}</td></tr>
        <tr><td><strong>Severity:</strong></td><td>${breach.severity}</td></tr>
        <tr><td><strong>Установен на:</strong></td><td>${detectedStr}</td></tr>
        <tr><td><strong>КЗЛД Deadline:</strong></td><td>${deadlineStr}</td></tr>
        <tr><td><strong>ID:</strong></td><td>${breach.id}</td></tr>
      </table>
      <p>— Branivo Platform</p>
    `;

    try {
      await this.emailService.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM') ?? 'noreply@branivo.com',
        to: adminEmail,
        subject: subjectMap[alertType],
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send breach alert [${alertType}] for breach ${breach.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private toDto(
    breach: DataBreach,
    severityAutoElevated?: boolean,
  ): DataBreachResponseDto {
    const now = new Date();
    const dto = new DataBreachResponseDto();
    dto.id = breach.id;
    dto.tenantId = breach.tenantId;
    dto.title = breach.title;
    dto.description = breach.description;
    dto.breachType = breach.breachType;
    dto.severity = breach.severity;
    dto.status = breach.status;
    dto.detectedAt = breach.detectedAt;
    dto.reportedBy = breach.reportedBy;
    dto.affectedDataCategories = breach.affectedDataCategories;
    dto.affectedSubjectsCount = breach.affectedSubjectsCount;
    dto.affectedSubjectsDescription = breach.affectedSubjectsDescription;
    dto.kzldNotificationRequired = breach.kzldNotificationRequired;
    dto.kzldNotifiedAt = breach.kzldNotifiedAt;
    dto.kzldNotificationReference = breach.kzldNotificationReference;
    dto.kzldNotificationDeadline = breach.kzldNotificationDeadline;
    dto.clientNotificationRequired = breach.clientNotificationRequired;
    dto.clientNotificationSentAt = breach.clientNotificationSentAt;
    dto.containmentActions = breach.containmentActions;
    dto.remediationActions = breach.remediationActions;
    dto.lessonsLearned = breach.lessonsLearned;
    dto.closedAt = breach.closedAt;
    dto.createdAt = breach.createdAt;
    dto.updatedAt = breach.updatedAt;

    if (breach.kzldNotifiedAt !== null) {
      dto.hoursUntilDeadline = null;
    } else {
      dto.hoursUntilDeadline = hoursUntilDate(
        breach.kzldNotificationDeadline,
        now,
      );
    }

    dto.isOverdue =
      breach.kzldNotifiedAt === null &&
      breach.kzldNotificationRequired &&
      breach.kzldNotificationDeadline < now;

    if (severityAutoElevated) {
      (
        dto as DataBreachResponseDto & {
          warning?: string;
          warningMessage?: string;
        }
      ).warning = 'SEVERITY_AUTO_ELEVATED';
      (
        dto as DataBreachResponseDto & {
          warning?: string;
          warningMessage?: string;
        }
      ).warningMessage =
        'Special category data detected; severity elevated to high';
    }

    return dto;
  }
}
