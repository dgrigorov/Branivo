export class TosResponseDto {
  id!: string;
  version!: number;
  content!: string;
  language!: string;
  isPublished!: boolean;
  publishedAt!: Date | null;
  createdAt!: Date;
}

export class TosListItemDto {
  id!: string;
  version!: number;
  language!: string;
  isPublished!: boolean;
  publishedAt!: Date | null;
  createdAt!: Date;
}

export class TosAcceptanceResponseDto {
  accepted!: boolean;
  version!: number;
  acceptedAt!: Date;
}

export class TosStatusResponseDto {
  requiresAcceptance!: boolean;
  currentVersion!: TosResponseDto | null;
  acceptedVersion!: number | null;
}
