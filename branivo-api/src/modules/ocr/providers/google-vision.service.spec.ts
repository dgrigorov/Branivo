import { GoogleVisionService } from './google-vision.service';

describe('GoogleVisionService.parseVehicleRegistration', () => {
  let service: GoogleVisionService;

  beforeEach(() => {
    service = new GoogleVisionService();
  });

  // Simulates text returned by Google Vision DOCUMENT_TEXT_DETECTION
  // for a real Bulgarian vehicle registration certificate (малък талон)
  const sampleFrontSide = [
    '(A) AA0000BB   No 000000002',
    '(E) WDDTESTVIN0000001',
    '(D) ЛЕК АВТОМОБИЛ',
    'MOTOR CAR',
    '(D.1) МЕРЦЕДЕС С 350',
    'MERCEDES S 350',
    '(D.2)*** *** ***',
    '(D.3)***',
    '(K) ***',
    '(R) ЧЕРЕН',
    'BLACK',
  ].join('\n');

  const sampleBackSide = [
    '(J) M1   (B) 28.07.2006   (I) 14.09.2023   (H)',
    '(G) 1805   (F.1) 2425   (F.2) 2475   (F.3) 4575',
    '(P.1) 3498   (P.2) 200',
    '(P.3) БЕНЗИН (PETROL)',
    '(S.1) 4+1   (S.2)***',
    '(V.9) EURO 4',
    'No 000000002',
  ].join('\n');

  const sampleOwnerSide = [
    '(C.2.1) ПЕТРОВ',
    'PETROV',
    '(C.2.2) ИВАН ТЕСТОВ',
    'IVAN TESTOV',
    '(C.2.3) Обл. СОФИЯ, общ. СТОЛИЧНА, ГР.СОФИЯ',
    'ЖК ЛЮЛИН, бл./№: 806, вх: Д, ет: 6, ап: 106',
    'ЕГН/ID 0000000000',
    'M<BGR<0000000002<AA0000BB1<2<',
    'WDDTESTVIN0000001950209714 7<<',
    'PETROV<<IVAN<TESTOV<<<',
  ].join('\n');

  const fullText = [sampleFrontSide, sampleBackSide, sampleOwnerSide].join(
    '\n',
  );

  describe('license_plate', () => {
    it('extracts license plate from (A) field', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.license_plate?.value).toBe('AA0000BB');
      expect(result.license_plate?.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('vin', () => {
    it('extracts 17-char VIN from (E) field', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.vin?.value).toBe('WDDTESTVIN0000001');
      expect(result.vin?.auto_filled).toBe(true);
    });
  });

  describe('cert_number', () => {
    it('extracts certificate number from No field', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.cert_number?.value).toBe('000000002');
    });
  });

  describe('make and model', () => {
    it('extracts make and model from (D.1) Latin text', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.make?.value).toBe('MERCEDES');
      expect(result.model?.value).toBe('S 350');
    });
  });

  describe('color', () => {
    it('extracts first word from (R) field (Bulgarian)', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.color?.value).toBe('ЧЕРЕН');
    });
  });

  describe('first_registration_date', () => {
    it('extracts date from (B) field', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.first_registration_date?.value).toBe('28.07.2006');
    });
  });

  describe('engine_volume', () => {
    it('extracts engine displacement from (P.1)', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.engine_volume?.value).toBe('3498');
    });
  });

  describe('fuel_type', () => {
    it('normalizes БЕНЗИН to Бензин', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.fuel_type?.value).toBe('Бензин');
    });
  });

  describe('owner_name', () => {
    it('builds owner name from C.2.1 + C.2.2 Latin transliteration', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.owner_name?.value).toBeTruthy();
      expect(result.owner_name?.value).toContain('PETROV');
    });
  });

  describe('owner_egn', () => {
    it('extracts EGN from ЕГН/ID label', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.owner_egn?.value).toBe('0000000000');
    });

    it('extracts EGN from MRZ line 2 when label is missing', () => {
      const textWithoutLabel = [
        sampleFrontSide,
        sampleBackSide,
        sampleOwnerSide.replace('ЕГН/ID 0000000000', ''),
      ].join('\n');
      const result = service.parseVehicleRegistration(textWithoutLabel);
      expect(result.owner_egn?.value).toBe('0000000000');
    });
  });

  describe('owner_address', () => {
    it('extracts address from C.2.3', () => {
      const result = service.parseVehicleRegistration(fullText);
      expect(result.owner_address?.value).toBeTruthy();
      expect(result.owner_address?.value).toContain('СОФИЯ');
    });
  });

  describe('empty text', () => {
    it('returns all null fields for empty string', () => {
      const result = service.parseVehicleRegistration('');
      expect(result.license_plate?.value).toBeNull();
      expect(result.vin?.value).toBeNull();
      expect(result.make?.value).toBeNull();
      expect(result.owner_egn?.value).toBeNull();
    });
  });
});
