import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/fleet/bloc/fleet_bloc.dart';
import 'package:branivo_app/features/fleet/bloc/fleet_event.dart';
import 'package:branivo_app/features/fleet/bloc/fleet_state.dart';
import 'package:branivo_app/features/fleet/data/models/driver_vehicle.dart';
import 'package:branivo_app/features/fleet/data/repositories/fleet_repository.dart';
import 'package:branivo_app/features/fleet/screens/driver_dashboard_screen.dart';

const _defaultPolicyExpiry = _NoExpiry();

class _NoExpiry {
  const _NoExpiry();
}

DriverVehicle makeDriverVehicle({
  String vehicleId = 'v-id-1',
  String licensePlate = 'КА0001ФЛ',
  String make = 'BMW',
  String model = 'X5',
  String? insurerName = 'Allianz Bulgaria',
  Object? policyExpiresAt = _defaultPolicyExpiry,
  String? policyStatus = 'active',
}) {
  final DateTime? resolvedExpiry = policyExpiresAt is _NoExpiry
      ? DateTime.now().add(const Duration(days: 60))
      : policyExpiresAt as DateTime?;
  return DriverVehicle(
    vehicleId: vehicleId,
    licensePlate: licensePlate,
    make: make,
    model: model,
    insurerName: insurerName,
    policyExpiresAt: resolvedExpiry,
    policyStatus: policyStatus,
  );
}

class _MockFleetRepository extends Mock implements FleetRepository {}

/// A FleetBloc seeded to a specific state that ignores all incoming events.
class _SeedBloc extends FleetBloc {
  final FleetState _seedState;

  _SeedBloc(this._seedState)
      : super(fleetRepository: _MockFleetRepository()) {
    emit(_seedState);
  }

  @override
  void add(FleetEvent event) {
    // Ignore all events — keep seeded state
  }
}

Widget buildTestWidget(FleetState seedState) {
  return MaterialApp(
    home: BlocProvider<FleetBloc>(
      create: (_) => _SeedBloc(seedState),
      child: const DriverDashboardScreen(),
    ),
  );
}

void main() {
  group('DriverDashboardScreen', () {
    testWidgets('shows loading indicator when FleetLoading state',
        (tester) async {
      await tester.pumpWidget(buildTestWidget(const FleetLoading()));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows error message when FleetError state', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(const FleetError(message: 'Грешка при зареждане')),
      );
      await tester.pump();

      expect(find.text('Грешка при зареждане'), findsOneWidget);
    });

    testWidgets('shows vehicle cards when DriverVehicleLoaded state',
        (tester) async {
      final vehicles = [
        makeDriverVehicle(licensePlate: 'КА0001ФЛ', make: 'BMW', model: 'X5'),
        makeDriverVehicle(
            licensePlate: 'КА0002ФЛ', make: 'Mercedes', model: 'C-Class'),
      ];

      await tester
          .pumpWidget(buildTestWidget(DriverVehicleLoaded(vehicles: vehicles)));
      await tester.pump();

      expect(find.text('КА0001ФЛ'), findsOneWidget);
      expect(find.text('КА0002ФЛ'), findsOneWidget);
      expect(find.text('BMW X5'), findsOneWidget);
      expect(find.text('Mercedes C-Class'), findsOneWidget);
    });

    testWidgets('shows "Нямате назначени МПС" when vehicle list is empty',
        (tester) async {
      await tester.pumpWidget(
        buildTestWidget(const DriverVehicleLoaded(vehicles: [])),
      );
      await tester.pump();

      expect(find.text('Нямате назначени МПС'), findsOneWidget);
    });

    testWidgets('shows "Без застраховател" when insurerName is null',
        (tester) async {
      final vehicles = [makeDriverVehicle(insurerName: null)];

      await tester.pumpWidget(
        buildTestWidget(DriverVehicleLoaded(vehicles: vehicles)),
      );
      await tester.pump();

      expect(find.text('Без застраховател'), findsOneWidget);
    });

    testWidgets('shows "Няма активна полица" when no policy', (tester) async {
      final vehicles = [
        makeDriverVehicle(policyExpiresAt: null, policyStatus: null),
      ];

      await tester.pumpWidget(
        buildTestWidget(DriverVehicleLoaded(vehicles: vehicles)),
      );
      await tester.pump();

      expect(find.text('Няма активна полица'), findsOneWidget);
    });

    testWidgets('driver screen does not show bulk action controls',
        (tester) async {
      final vehicles = [makeDriverVehicle()];

      await tester.pumpWidget(
        buildTestWidget(DriverVehicleLoaded(vehicles: vehicles)),
      );
      await tester.pump();

      expect(find.text('Получи оферти'), findsNothing);
      expect(find.text('Изтегли документи'), findsNothing);
      expect(find.byType(Checkbox), findsNothing);
    });
  });
}
