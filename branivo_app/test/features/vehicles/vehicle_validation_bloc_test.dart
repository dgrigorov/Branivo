import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/vehicles/bloc/vehicle_validation_bloc.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicle_api_repository.dart';

class MockVehicleApiRepository extends Mock implements VehicleApiRepository {}

void main() {
  late MockVehicleApiRepository mockRepository;

  const vin = 'WVWZZZ3BZ3E123456';
  const licensePlate = 'СА1234АА';

  final successResult = VehicleValidationResult(
    canProceedToQuote: true,
    katStatus: 'ok',
    gfStatus: 'clean',
    vinValid: true,
    validatedAt: '2026-03-19T10:00:00.000Z',
  );

  final katFallbackResult = VehicleValidationResult(
    canProceedToQuote: true,
    katStatus: 'manual_fallback',
    gfStatus: 'clean',
    vinValid: true,
    validatedAt: '2026-03-19T10:00:00.000Z',
  );

  setUp(() {
    mockRepository = MockVehicleApiRepository();
  });

  VehicleValidationBloc buildBloc() =>
      VehicleValidationBloc(repository: mockRepository);

  group('VehicleValidationBloc', () {
    // Test 1: ValidateVehicleEvent → loading → success
    test('ValidateVehicleEvent → loading → VehicleValidationSuccess', () async {
      when(
        () => mockRepository.validateVehicle(vin, licensePlate),
      ).thenAnswer((_) async => successResult);

      final bloc = buildBloc();
      bloc.add(const ValidateVehicleEvent(vin: vin, licensePlate: licensePlate));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehicleValidationLoading>(),
          isA<VehicleValidationSuccess>()
              .having((s) => s.result.canProceedToQuote, 'canProceed', true),
        ]),
      );
    });

    // Test 2: ValidateVehicleEvent → loading → GF blocked
    test('ValidateVehicleEvent → loading → VehicleValidationGfBlocked', () async {
      when(
        () => mockRepository.validateVehicle(vin, licensePlate),
      ).thenThrow(const VehicleGfBlockedException());

      final bloc = buildBloc();
      bloc.add(const ValidateVehicleEvent(vin: vin, licensePlate: licensePlate));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehicleValidationLoading>(),
          isA<VehicleValidationGfBlocked>(),
        ]),
      );
    });

    // Test 3: ValidateVehicleEvent → loading → KAT fallback
    test('ValidateVehicleEvent → loading → VehicleValidationKatFallback', () async {
      when(
        () => mockRepository.validateVehicle(vin, licensePlate),
      ).thenAnswer((_) async => katFallbackResult);

      final bloc = buildBloc();
      bloc.add(const ValidateVehicleEvent(vin: vin, licensePlate: licensePlate));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehicleValidationLoading>(),
          isA<VehicleValidationKatFallback>(),
        ]),
      );
    });

    // Test 4: KatManualConfirmEvent при KAT fallback → re-validate с katManuallyConfirmed: true
    test('KatManualConfirmEvent → re-validates with katManuallyConfirmed: true', () async {
      when(
        () => mockRepository.validateVehicle(
          vin,
          licensePlate,
          katManuallyConfirmed: true,
        ),
      ).thenAnswer((_) async => successResult);

      final bloc = buildBloc();
      bloc.add(KatManualConfirmEvent(vin: vin, licensePlate: licensePlate));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehicleValidationLoading>(),
          isA<VehicleValidationSuccess>()
              .having((s) => s.result.canProceedToQuote, 'canProceed', true),
        ]),
      );

      verify(
        () => mockRepository.validateVehicle(
          vin,
          licensePlate,
          katManuallyConfirmed: true,
        ),
      ).called(1);
    });

    // Test 5: VIN invalid → VehicleValidationError
    test('ValidateVehicleEvent with invalid VIN → VehicleValidationError', () async {
      when(
        () => mockRepository.validateVehicle(vin, licensePlate),
      ).thenThrow(const VehicleVinInvalidException());

      final bloc = buildBloc();
      bloc.add(const ValidateVehicleEvent(vin: vin, licensePlate: licensePlate));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehicleValidationLoading>(),
          isA<VehicleValidationError>()
              .having((s) => s.message, 'message', 'VIN невалиден формат'),
        ]),
      );
    });
  });
}
