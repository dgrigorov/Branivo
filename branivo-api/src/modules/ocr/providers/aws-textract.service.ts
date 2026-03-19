import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TextractClient,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  Block,
  JobStatus,
} from '@aws-sdk/client-textract';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { OcrField, OcrFieldResult } from '../entities/ocr-job.entity';

const CONFIDENCE_THRESHOLD = 0.85;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 15; // 30 seconds max

@Injectable()
export class AwsTextractService {
  private readonly logger = new Logger(AwsTextractService.name);
  private readonly textract: TextractClient;
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(private readonly config: ConfigService) {
    const region = config.get<string>('AWS_REGION', 'eu-central-1');
    this.textract = new TextractClient({ region });
    this.s3 = new S3Client({ region });
    this.bucketName = config.getOrThrow<string>('DOCUMENTS_BUCKET_NAME');
  }

  async uploadImagesToS3(
    images: Buffer[],
    tenantId: string,
    jobId: string,
  ): Promise<{ bucket: string; keys: string[] }> {
    const keys: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const key = `ocr-temp/${tenantId}/${jobId}/image-${i}.jpg`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: images[i],
          ContentType: 'image/jpeg',
        }),
      );
      keys.push(key);
    }
    return { bucket: this.bucketName, keys };
  }

  async startAnalysis(s3Bucket: string, s3Key: string): Promise<string> {
    const response = await this.textract.send(
      new StartDocumentAnalysisCommand({
        DocumentLocation: { S3Object: { Bucket: s3Bucket, Name: s3Key } },
        FeatureTypes: ['FORMS'],
      }),
    );
    if (!response.JobId) throw new Error('Textract did not return a JobId');
    return response.JobId;
  }

  async getResults(textractJobId: string): Promise<OcrFieldResult> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await this.sleep(POLL_INTERVAL_MS);

      const response = await this.textract.send(
        new GetDocumentAnalysisCommand({ JobId: textractJobId }),
      );

      if (response.JobStatus === JobStatus.SUCCEEDED) {
        return this.parseTextractBlocks(response.Blocks ?? []);
      }
      if (response.JobStatus === JobStatus.FAILED) {
        throw new Error(
          `Textract job failed: ${response.StatusMessage ?? 'unknown error'}`,
        );
      }
    }
    throw new Error('Textract polling timeout exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildField(value: string | null, confidence: number): OcrField {
    return {
      value,
      confidence,
      auto_filled: confidence >= CONFIDENCE_THRESHOLD,
    };
  }

  parseTextractBlocks(blocks: Block[]): OcrFieldResult {
    const kvMap: Record<string, { value: string; confidence: number }> = {};

    const keyBlocks = blocks.filter(
      (b) => b.BlockType === 'KEY_VALUE_SET' && b.EntityTypes?.includes('KEY'),
    );

    for (const keyBlock of keyBlocks) {
      const keyText = this.getTextFromBlock(keyBlock, blocks)
        .toUpperCase()
        .trim();
      const valueBlock = this.findValueBlock(keyBlock, blocks);
      if (!valueBlock) continue;
      const valueText = this.getTextFromBlock(valueBlock, blocks).trim();
      const confidence = Math.min(
        (keyBlock.Confidence ?? 0) / 100,
        (valueBlock.Confidence ?? 0) / 100,
      );
      kvMap[keyText] = { value: valueText, confidence };
    }

    const find = (keys: string[]) => {
      for (const k of keys) {
        if (kvMap[k]) return kvMap[k];
      }
      return null;
    };

    const lp = find(['A', 'REG NO', 'REGISTRATION NUMBER']);
    const vin = find(['E', 'VIN', 'CHASSIS']);
    const make = find(['C.1.1', 'MAKE', 'МАРКА']);
    const model = find(['C.3', 'MODEL', 'МОДЕЛ']);
    const year = find(['YEAR', 'ГОДИНА']);
    const color = find(['R', 'COLOR', 'ЦВЯТ']);
    const engineVol = find(['P.1', 'ENGINE VOLUME', 'ОБЕ']);
    const fuel = find(['P.5', 'FUEL', 'ГОРИВО']);
    const firstReg = find(['B', 'FIRST REGISTRATION', 'ДАТА НА РЕГИСТРАЦИЯ']);

    const fuelMap: Record<string, string> = {
      '1': 'бензин',
      '2': 'дизел',
      '3': 'LPG',
      '4': 'електрически',
      '5': 'хибрид',
    };

    return {
      license_plate: this.buildField(lp?.value ?? null, lp?.confidence ?? 0),
      vin: this.buildField(vin?.value ?? null, vin?.confidence ?? 0),
      make: this.buildField(make?.value ?? null, make?.confidence ?? 0),
      model: this.buildField(model?.value ?? null, model?.confidence ?? 0),
      year: this.buildField(year?.value ?? null, year?.confidence ?? 0),
      color: this.buildField(color?.value ?? null, color?.confidence ?? 0),
      engine_volume: this.buildField(
        engineVol?.value ?? null,
        engineVol?.confidence ?? 0,
      ),
      fuel_type: this.buildField(
        fuel?.value ? (fuelMap[fuel.value] ?? fuel.value) : null,
        fuel?.confidence ?? 0,
      ),
      first_registration_date: this.buildField(
        firstReg?.value ?? null,
        firstReg?.confidence ?? 0,
      ),
    };
  }

  private getTextFromBlock(block: Block, allBlocks: Block[]): string {
    const wordIds =
      block.Relationships?.find((r) => r.Type === 'CHILD')?.Ids ?? [];
    return allBlocks
      .filter((b) => wordIds.includes(b.Id ?? '') && b.BlockType === 'WORD')
      .map((b) => b.Text ?? '')
      .join(' ');
  }

  private findValueBlock(keyBlock: Block, allBlocks: Block[]): Block | null {
    const valueId = keyBlock.Relationships?.find((r) => r.Type === 'VALUE')
      ?.Ids?.[0];
    if (!valueId) return null;
    return allBlocks.find((b) => b.Id === valueId) ?? null;
  }
}
