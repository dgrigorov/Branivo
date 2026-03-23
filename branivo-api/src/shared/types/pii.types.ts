export enum PiiClassification {
  PII_BASIC = 'PII_BASIC',
  PII_SENSITIVE = 'PII_SENSITIVE',
  PII_SPECIAL_CATEGORY = 'PII_SPECIAL_CATEGORY',
}

export interface PiiFieldMetadata {
  entityName: string;
  columnName: string;
  propertyName: string;
  classification: PiiClassification;
}
