import 'reflect-metadata';
import {
  PiiField,
  getPiiFields,
  PII_FIELD_METADATA_KEY,
  EntityClass,
} from './pii-field.decorator';
import { PiiClassification } from '../types/pii.types';

describe('PiiField decorator', () => {
  it('annotates a property with the correct classification', () => {
    class TestEntity {
      @PiiField(PiiClassification.PII_BASIC)
      email!: string;
    }

    const fields = getPiiFields(TestEntity as unknown as EntityClass);
    expect(fields).toHaveLength(1);
    expect(fields[0].propertyName).toBe('email');
    expect(fields[0].classification).toBe(PiiClassification.PII_BASIC);
    expect(fields[0].entityName).toBe('TestEntity');
  });

  it('returns empty array for entity with no annotations', () => {
    class PlainEntity {
      name!: string;
    }

    const fields = getPiiFields(PlainEntity as unknown as EntityClass);
    expect(fields).toHaveLength(0);
  });

  it('returns all annotated fields for entity with 2 annotations', () => {
    class TwoFieldEntity {
      @PiiField(PiiClassification.PII_BASIC)
      phoneNumber!: string;

      @PiiField(PiiClassification.PII_SENSITIVE)
      secretKey!: string;
    }

    const fields = getPiiFields(TwoFieldEntity as unknown as EntityClass);
    expect(fields).toHaveLength(2);

    const phoneField = fields.find((f) => f.propertyName === 'phoneNumber');
    expect(phoneField).toBeDefined();
    expect(phoneField?.classification).toBe(PiiClassification.PII_BASIC);
    expect(phoneField?.columnName).toBe('phone_number');

    const secretField = fields.find((f) => f.propertyName === 'secretKey');
    expect(secretField).toBeDefined();
    expect(secretField?.classification).toBe(PiiClassification.PII_SENSITIVE);
    expect(secretField?.columnName).toBe('secret_key');
  });

  it('does not inherit parent class PII fields (no prototype chain leakage)', () => {
    class ParentEntity {
      @PiiField(PiiClassification.PII_BASIC)
      parentEmail!: string;
    }

    class ChildEntity extends ParentEntity {
      @PiiField(PiiClassification.PII_SENSITIVE)
      childSecret!: string;
    }

    const parentFields = getPiiFields(ParentEntity as unknown as EntityClass);
    const childFields = getPiiFields(ChildEntity as unknown as EntityClass);

    expect(parentFields).toHaveLength(1);
    expect(parentFields[0].propertyName).toBe('parentEmail');

    // Child should only have its own field, not inherit parent's
    expect(childFields).toHaveLength(1);
    expect(childFields[0].propertyName).toBe('childSecret');
  });

  it('stores metadata using the correct metadata key', () => {
    class MetaTestEntity {
      @PiiField(PiiClassification.PII_SPECIAL_CATEGORY)
      healthData!: string;
    }

    const prototype: object = MetaTestEntity.prototype as object;
    const metadata: unknown = Reflect.getMetadata(
      PII_FIELD_METADATA_KEY,
      prototype,
    );
    expect(metadata).toBeDefined();
    expect(Array.isArray(metadata)).toBe(true);
  });
});
