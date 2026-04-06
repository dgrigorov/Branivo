export class PrivacyPolicyResponseDto {
  id!: string;
  version!: number;
  content!: string;
  language!: string;
  isPublished!: boolean;
  publishedAt!: Date | null;
  createdAt!: Date;
}

export class PrivacyPolicyListItemDto {
  id!: string;
  version!: number;
  language!: string;
  isPublished!: boolean;
  publishedAt!: Date | null;
  createdAt!: Date;
}
