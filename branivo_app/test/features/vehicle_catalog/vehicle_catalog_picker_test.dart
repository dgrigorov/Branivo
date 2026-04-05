import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/vehicle_catalog/data/models/catalog_make_model.dart';
import 'package:branivo_app/features/vehicle_catalog/data/repositories/vehicle_catalog_repository.dart';
import 'package:branivo_app/features/vehicle_catalog/widgets/vehicle_catalog_picker.dart';

class MockVehicleCatalogRepository extends Mock
    implements VehicleCatalogRepository {}

void main() {
  late MockVehicleCatalogRepository mockRepo;

  final bmw = CatalogMake(id: 'make-1', name: 'BMW', isPopular: true);
  final series3 = CatalogVehicleModel(
    id: 'model-1',
    makeId: 'make-1',
    makeName: 'BMW',
    name: '3 Series',
    yearFrom: 2012,
    yearTo: 2019,
  );

  setUp(() {
    mockRepo = MockVehicleCatalogRepository();
    when(() => mockRepo.searchMakes(q: any(named: 'q'), limit: any(named: 'limit')))
        .thenAnswer((_) async => [bmw]);
    when(() => mockRepo.searchModels(any(),
            q: any(named: 'q'), limit: any(named: 'limit')))
        .thenAnswer((_) async => [series3]);
    when(() => mockRepo.getModifications(any(), limit: any(named: 'limit')))
        .thenAnswer((_) async => []);
  });

  Widget buildPicker({
    void Function(VehicleCatalogSelection?)? onChanged,
    String? initialMakeText,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: VehicleCatalogPicker(
          repository: mockRepo,
          initialMakeText: initialMakeText,
          onChanged: onChanged ?? (_) {},
        ),
      ),
    );
  }

  group('VehicleCatalogPicker', () {
    testWidgets('renders make and model picker fields', (tester) async {
      await tester.pumpWidget(buildPicker());

      expect(find.text('Марка'), findsOneWidget);
      expect(find.text('Модел'), findsOneWidget);
    });

    testWidgets('model field is disabled before make is selected',
        (tester) async {
      await tester.pumpWidget(buildPicker());

      expect(find.text('Изберете марка първо'), findsOneWidget);
    });

    testWidgets('shows initialMakeText as hint value when provided',
        (tester) async {
      await tester.pumpWidget(buildPicker(initialMakeText: 'BMW'));

      expect(find.text('BMW'), findsOneWidget);
    });

    testWidgets('shows modifications field when showModifications=true',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: VehicleCatalogPicker(
              repository: mockRepo,
              showModifications: true,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      expect(find.text('Модификация'), findsOneWidget);
    });

    testWidgets('hides modifications field when showModifications=false',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: VehicleCatalogPicker(
              repository: mockRepo,
              showModifications: false,
              onChanged: (_) {},
            ),
          ),
        ),
      );

      expect(find.text('Модификация'), findsNothing);
    });
  });
}
