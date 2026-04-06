export class CookiePolicyResponseDto {
  id!: string;
  version!: number;
  content!: string;
  language!: string;
  isPublished!: boolean;
  publishedAt!: Date | null;
  createdAt!: Date;
}

export class CookiePolicyListItemDto {
  id!: string;
  version!: number;
  language!: string;
  isPublished!: boolean;
  publishedAt!: Date | null;
  createdAt!: Date;
}
