import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { PiiRegistryService } from './pii-registry.service';
import {
  PiiField,
  EntityClass,
} from '../../shared/decorators/pii-field.decorator';
import { PiiClassification } from '../../shared/types/pii.types';

describe('PiiRegistryService', () => {
  let service: PiiRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PiiRegistryService],
    }).compile();

    service = module.get<PiiRegistryService>(PiiRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFieldsForEntity', () => {
    it('returns annotated fields for a mock entity', () => {
      class MockEntity {
        @PiiField(PiiClassification.PII_BASIC)
        email!: string;

        @PiiField(PiiClassification.PII_SENSITIVE)
        secretToken!: string;
      }

      const fields = service.getFieldsForEntity(
        MockEntity as unknown as EntityClass,
      );
      expect(fields).toHaveLength(2);
      expect(fields.map((f) => f.propertyName)).toContain('email');
      expect(fields.map((f) => f.propertyName)).toContain('secretToken');
    });

    it('returns empty array for entity with no PII annotations', () => {
      class CleanEntity {
        tenantId!: string;
        createdAt!: Date;
      }

      const fields = service.getFieldsForEntity(
        CleanEntity as unknown as EntityClass,
      );
      expect(fields).toHaveLength(0);
    });
  });

  describe('getAllPiiFields', () => {
    it('returns fields from all registered entities', () => {
      const all = service.getAllPiiFields();
      expect(all.length).toBeGreaterThan(0);

      // Verify known mandatory fields from AC3
      const entityNames = all.map((f) => f.entityName);
      expect(entityNames).toContain('User');
      expect(entityNames).toContain('EndClient');
      expect(entityNames).toContain('Vehicle');
      expect(entityNames).toContain('Payment');
    });

    it('includes specific fields required by AC3 (classification + columnName)', () => {
      const all = service.getAllPiiFields();

      const find = (entityName: string, propertyName: string) =>
        all.find(
          (f) => f.entityName === entityName && f.propertyName === propertyName,
        );

      const phoneField = find('EndClient', 'phoneNumber');
      expect(phoneField?.classification).toBe(PiiClassification.PII_BASIC);
      expect(phoneField?.columnName).toBe('phone_number');

      const emailEndClient = find('EndClient', 'email');
      expect(emailEndClient?.classification).toBe(PiiClassification.PII_BASIC);
      expect(emailEndClient?.columnName).toBe('email');

      const firstNameField = find('EndClient', 'firstName');
      expect(firstNameField?.classification).toBe(PiiClassification.PII_BASIC);
      expect(firstNameField?.columnName).toBe('first_name');

      const lastNameField = find('EndClient', 'lastName');
      expect(lastNameField?.classification).toBe(PiiClassification.PII_BASIC);
      expect(lastNameField?.columnName).toBe('last_name');

      const userEmail = find('User', 'email');
      expect(userEmail?.classification).toBe(PiiClassification.PII_BASIC);
      expect(userEmail?.columnName).toBe('email');

      const twoFaField = find('User', 'twoFaSecretEnc');
      expect(twoFaField?.classification).toBe(PiiClassification.PII_SENSITIVE);
      expect(twoFaField?.columnName).toBe('two_fa_secret_enc');

      const vinField = find('Vehicle', 'vin');
      expect(vinField?.classification).toBe(PiiClassification.PII_BASIC);
      expect(vinField?.columnName).toBe('vin');

      const licensePlateField = find('Vehicle', 'licensePlate');
      expect(licensePlateField?.classification).toBe(
        PiiClassification.PII_BASIC,
      );
      expect(licensePlateField?.columnName).toBe('license_plate');

      const intentIdField = find('Payment', 'stripePaymentIntentId');
      expect(intentIdField?.classification).toBe(
        PiiClassification.PII_SENSITIVE,
      );
      expect(intentIdField?.columnName).toBe('stripe_payment_intent_id');

      const secretField = find('Payment', 'stripeClientSecret');
      expect(secretField?.classification).toBe(PiiClassification.PII_SENSITIVE);
      expect(secretField?.columnName).toBe('stripe_client_secret');

      const amountField = find('Payment', 'amount');
      expect(amountField?.classification).toBe(PiiClassification.PII_SENSITIVE);
      expect(amountField?.columnName).toBe('amount');
    });

    it('includes Policy PII fields (policyNumber, stripePaymentIntentId, deliveryAddress)', () => {
      const all = service.getAllPiiFields();

      const find = (entityName: string, propertyName: string) =>
        all.find(
          (f) => f.entityName === entityName && f.propertyName === propertyName,
        );

      expect(find('Policy', 'policyNumber')?.classification).toBe(
        PiiClassification.PII_BASIC,
      );
      expect(find('Policy', 'stripePaymentIntentId')?.classification).toBe(
        PiiClassification.PII_SENSITIVE,
      );
      expect(find('Policy', 'deliveryAddress')?.classification).toBe(
        PiiClassification.PII_BASIC,
      );
    });

    it('returns the same reference on repeated calls (cache)', () => {
      const first = service.getAllPiiFields();
      const second = service.getAllPiiFields();
      expect(first).toBe(second);
    });

    it('does NOT include password_hash from User (AC5)', () => {
      const all = service.getAllPiiFields();
      const passwordField = all.find(
        (f) => f.entityName === 'User' && f.propertyName === 'passwordHash',
      );
      expect(passwordField).toBeUndefined();
    });
  });

  describe('getFieldsByClassification', () => {
    it('filters fields by PII_SENSITIVE classification', () => {
      const sensitive = service.getFieldsByClassification(
        PiiClassification.PII_SENSITIVE,
      );
      expect(sensitive.length).toBeGreaterThan(0);
      sensitive.forEach((f) => {
        expect(f.classification).toBe(PiiClassification.PII_SENSITIVE);
      });
    });

    it('filters fields by PII_BASIC classification', () => {
      const basic = service.getFieldsByClassification(
        PiiClassification.PII_BASIC,
      );
      expect(basic.length).toBeGreaterThan(0);
      basic.forEach((f) => {
        expect(f.classification).toBe(PiiClassification.PII_BASIC);
      });
    });

    it('returns empty array for PII_SPECIAL_CATEGORY (none in Phase 1)', () => {
      const special = service.getFieldsByClassification(
        PiiClassification.PII_SPECIAL_CATEGORY,
      );
      expect(special).toHaveLength(0);
    });
  });
});
