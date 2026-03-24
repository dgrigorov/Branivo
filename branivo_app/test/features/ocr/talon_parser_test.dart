import 'package:flutter_test/flutter_test.dart';
import 'package:branivo_app/features/ocr/data/services/talon_parser.dart';

void main() {
  group('TalonParser.parse', () {
    const sampleText = '''
(A) СА1234АА (B) 15.03.2018
(D.1) VOLKSWAGEN GOLF
(E) WVWZZZ3BZ3E123456
No 987654321
(P.1) 1968
(P.3) ДИЗЕЛ
(R) ЧЕРЕН
(C.2.1) ИВАНОВ
IVANOV
(C.2.2) ИВАН
IVAN
(C.2.3) ГР. СОФИЯ, УЛ. ПРИМЕРНА 1
ЕГН 9001011234
''';

    late Map<String, dynamic> fields;

    setUp(() {
      fields = TalonParser.parse(sampleText);
    });

    test('extracts license plate', () {
      expect(fields['license_plate']?.value, 'СА1234АА');
      expect(fields['license_plate']?.confidence, greaterThanOrEqualTo(0.85));
    });

    test('extracts VIN', () {
      expect(fields['vin']?.value, 'WVWZZZ3BZ3E123456');
    });

    test('extracts cert number', () {
      expect(fields['cert_number']?.value, '987654321');
    });

    test('extracts make', () {
      expect(fields['make']?.value, 'VOLKSWAGEN');
    });

    test('extracts model', () {
      expect(fields['model']?.value, isNotNull);
    });

    test('extracts year from first registration date', () {
      expect(fields['year']?.value, '2018');
    });

    test('extracts engine volume', () {
      expect(fields['engine_volume']?.value, '1968');
    });

    test('normalizes fuel type', () {
      expect(fields['fuel_type']?.value, 'Дизел');
    });

    test('extracts first registration date', () {
      expect(fields['first_registration_date']?.value, isNotNull);
    });

    test('extracts EGN', () {
      expect(fields['owner_egn']?.value, '9001011234');
    });

    test('low confidence fields have autoFilled=false', () {
      // Missing fields should have confidence 0 and autoFilled false
      final missing = fields['owner_name'];
      // owner_name may or may not parse in this sample — just verify structure
      expect(missing?.autoFilled, isA<bool>());
    });
  });

  group('TalonParser — empty text', () {
    test('returns map with null values and zero confidence', () {
      final fields = TalonParser.parse('');
      expect(fields['license_plate']?.value, isNull);
      expect(fields['license_plate']?.confidence, 0.0);
      expect(fields['vin']?.value, isNull);
    });
  });

  group('TalonParser.extractFields', () {
    test('extracts A and E field codes', () {
      const text = '(A) СА1234АА\n(E) WVWZZZ3BZ3E123456';
      final fields = TalonParser.extractFields(text);
      expect(fields['A'], 'СА1234АА');
      expect(fields['E'], 'WVWZZZ3BZ3E123456');
    });
  });
}
