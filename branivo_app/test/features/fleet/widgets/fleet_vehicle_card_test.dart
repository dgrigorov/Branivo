import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:branivo_app/features/fleet/data/models/fleet_vehicle.dart';
import 'package:branivo_app/features/fleet/widgets/fleet_vehicle_card.dart';

FleetVehicle makeVehicle({
  String id = 'fv-id-1',
  String licensePlate = 'СА1234АВ',
  String make = 'Toyota',
  String model = 'Corolla',
  String? insurerName = 'ДЗИ',
  DateTime? policyExpiresAt,
  FleetVehicleStatus status = FleetVehicleStatus.green,
}) {
  return FleetVehicle(
    id: id,
    vehicleId: 'v-id-1',
    licensePlate: licensePlate,
    make: make,
    model: model,
    insurerName: insurerName,
    policyExpiresAt: policyExpiresAt,
    status: status,
  );
}

Widget buildTestWidget(FleetVehicle vehicle) {
  return MaterialApp(
    home: Scaffold(
      body: FleetVehicleCard(vehicle: vehicle),
    ),
  );
}

void main() {
  group('FleetVehicleCard', () {
    testWidgets('renders license plate and make/model', (tester) async {
      final vehicle = makeVehicle(
        licensePlate: 'СА1234АВ',
        make: 'Toyota',
        model: 'Corolla',
        status: FleetVehicleStatus.green,
      );

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('СА1234АВ'), findsOneWidget);
      expect(find.text('Toyota Corolla'), findsOneWidget);
    });

    testWidgets('renders green status with check icon', (tester) async {
      final vehicle = makeVehicle(status: FleetVehicleStatus.green);

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('✓'), findsOneWidget);
      expect(find.text('Активна'), findsOneWidget);
    });

    testWidgets('renders yellow status with warning icon', (tester) async {
      final vehicle = makeVehicle(status: FleetVehicleStatus.yellow);

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('⚠'), findsOneWidget);
      expect(find.text('Скоро изтича'), findsOneWidget);
    });

    testWidgets('renders red status with cross icon', (tester) async {
      final vehicle = makeVehicle(status: FleetVehicleStatus.red);

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('✕'), findsOneWidget);
      expect(find.text('Изтекла'), findsOneWidget);
    });

    testWidgets('shows insurer name when available', (tester) async {
      final vehicle = makeVehicle(insurerName: 'Allianz Bulgaria');

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('Allianz Bulgaria'), findsOneWidget);
    });

    testWidgets('shows "Без застраховател" when insurer is null', (tester) async {
      final vehicle = makeVehicle(insurerName: null);

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('Без застраховател'), findsOneWidget);
    });

    testWidgets('shows policy expiry date when available', (tester) async {
      final expiryDate = DateTime(2026, 6, 15);
      final vehicle = makeVehicle(
        policyExpiresAt: expiryDate,
        status: FleetVehicleStatus.green,
      );

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.textContaining('15.06.2026'), findsOneWidget);
    });

    testWidgets('shows "Няма активна полица" when policyExpiresAt is null',
        (tester) async {
      final vehicle = makeVehicle(
        policyExpiresAt: null,
        status: FleetVehicleStatus.red,
      );

      await tester.pumpWidget(buildTestWidget(vehicle));

      expect(find.text('Няма активна полица'), findsOneWidget);
    });
  });
}
