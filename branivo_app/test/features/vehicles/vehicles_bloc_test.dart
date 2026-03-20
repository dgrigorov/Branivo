import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/vehicles/bloc/vehicles_bloc.dart';
import 'package:branivo_app/features/vehicles/bloc/vehicles_event.dart';
import 'package:branivo_app/features/vehicles/bloc/vehicles_state.dart';
import 'package:branivo_app/features/vehicles/data/models/vehicle_model.dart';
import 'package:branivo_app/features/vehicles/data/repositories/vehicles_repository.dart';

class MockVehiclesRepository extends Mock implements VehiclesRepository {}

class FakeVehicleModel extends Fake implements VehicleModel {}

const _testVehicle = VehicleModel(
  id: 'vehicle-uuid-456',
  tenantId: 'tenant-uuid',
  ownerId: 'owner-uuid',
  vin: 'WVWZZZ3BZ3E123456',
  licensePlate: 'СА1234АА',
  make: 'VW',
  model: 'Golf',
  year: 2020,
  createdAt: '2026-03-19T10:00:00Z',
  updatedAt: '2026-03-19T10:00:00Z',
);

void main() {
  setUpAll(() {
    registerFallbackValue(FakeVehicleModel());
  });

  late MockVehiclesRepository mockRepository;
  late VehiclesBloc bloc;

  setUp(() {
    mockRepository = MockVehiclesRepository();
    bloc = VehiclesBloc(repository: mockRepository);
  });

  tearDown(() {
    bloc.close();
  });

  group('LoadVehicles', () {
    test('LoadVehicles → VehiclesEmpty when list is empty', () async {
      when(() => mockRepository.listVehicles()).thenAnswer((_) async => []);

      bloc.add(const LoadVehicles());

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehiclesLoading>(),
          isA<VehiclesEmpty>(),
        ]),
      );
    });

    test('LoadVehicles → VehiclesLoaded when vehicles exist', () async {
      when(() => mockRepository.listVehicles())
          .thenAnswer((_) async => [_testVehicle]);

      bloc.add(const LoadVehicles());

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehiclesLoading>(),
          isA<VehiclesLoaded>(),
        ]),
      );

      expect((bloc.state as VehiclesLoaded).vehicles, hasLength(1));
      expect(
        (bloc.state as VehiclesLoaded).vehicles.first.id,
        'vehicle-uuid-456',
      );
    });
  });

  group('SaveVehicle', () {
    test('SaveVehicle → VehiclesSaveSuccess on success', () async {
      when(() => mockRepository.saveVehicle(any()))
          .thenAnswer((_) async => _testVehicle);

      bloc.add(const SaveVehicle(_testVehicle));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehiclesLoading>(),
          isA<VehiclesSaveSuccess>(),
        ]),
      );

      expect(
        (bloc.state as VehiclesSaveSuccess).vehicle.id,
        'vehicle-uuid-456',
      );
    });

    test('SaveVehicle → VehiclesError on failure', () async {
      when(() => mockRepository.saveVehicle(any()))
          .thenThrow(const VehiclesRepositoryException('Save failed'));

      bloc.add(const SaveVehicle(_testVehicle));

      await expectLater(
        bloc.stream,
        emitsInOrder([
          isA<VehiclesLoading>(),
          isA<VehiclesError>(),
        ]),
      );

      expect((bloc.state as VehiclesError).message, contains('Save failed'));
    });
  });

  group('SelectVehicle', () {
    test('SelectVehicle → stores selected vehicle', () async {
      when(() => mockRepository.listVehicles())
          .thenAnswer((_) async => [_testVehicle]);

      bloc.add(const LoadVehicles());
      await Future<void>.delayed(const Duration(milliseconds: 100));

      bloc.add(const SelectVehicle(_testVehicle));
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(bloc.selectedVehicle?.id, 'vehicle-uuid-456');
    });
  });
}
