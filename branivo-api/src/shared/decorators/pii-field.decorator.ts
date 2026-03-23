import { getMetadataArgsStorage } from 'typeorm';
import { PiiClassification, PiiFieldMetadata } from '../types/pii.types';

export const PII_FIELD_METADATA_KEY = 'pii:field';

interface StoredPiiEntry {
  propertyKey: string;
  classification: PiiClassification;
}

export function PiiField(classification: PiiClassification): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const existing: StoredPiiEntry[] =
      (Reflect.getOwnMetadata(PII_FIELD_METADATA_KEY, target) as
        | StoredPiiEntry[]
        | undefined) ?? [];
    Reflect.defineMetadata(
      PII_FIELD_METADATA_KEY,
      [...existing, { propertyKey: String(propertyKey), classification }],
      target,
    );
  };
}

export type EntityClass = abstract new (...args: unknown[]) => unknown;

function toSnakeCase(camelCase: string): string {
  return camelCase.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function resolveColumnName(
  entityClass: EntityClass,
  propertyKey: string,
): string {
  const storage = getMetadataArgsStorage();
  const columnArg = storage.columns.find(
    (c) => c.target === entityClass && c.propertyName === propertyKey,
  );
  const nameFromOptions = columnArg?.options?.name;
  return typeof nameFromOptions === 'string' && nameFromOptions.length > 0
    ? nameFromOptions
    : toSnakeCase(propertyKey);
}

export function getPiiFields(entityClass: EntityClass): PiiFieldMetadata[] {
  const prototype: object = entityClass.prototype as object;
  const entries: StoredPiiEntry[] =
    (Reflect.getOwnMetadata(PII_FIELD_METADATA_KEY, prototype) as
      | StoredPiiEntry[]
      | undefined) ?? [];
  const entityName = entityClass.name;

  return entries.map((entry) => ({
    entityName,
    columnName: resolveColumnName(entityClass, entry.propertyKey),
    propertyName: entry.propertyKey,
    classification: entry.classification,
  }));
}
