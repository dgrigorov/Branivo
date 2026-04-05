import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:branivo_app/features/vehicle_catalog/data/repositories/vehicle_catalog_repository.dart';

class MockDio extends Mock implements Dio {}

void main() {
  late MockDio mockDio;
  late VehicleCatalogRepository repository;

  setUp(() {
    mockDio = MockDio();
    repository = VehicleCatalogRepository(dio: mockDio);
  });

  group('VehicleCatalogRepository', () {
    group('searchMakes', () {
      test('returns list of CatalogMake from response', () async {
        when(
          () => mockDio.get<List<dynamic>>(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: ''),
            data: [
              {
                'id': 'uuid-1',
                'name': 'BMW',
                'logoUrl': null,
                'isPopular': true,
              },
              {
                'id': 'uuid-2',
                'name': 'AUDI',
                'logoUrl': 'https://example.com/audi.png',
                'isPopular': true,
              },
            ],
          ),
        );

        final makes = await repository.searchMakes(q: 'b');

        expect(makes, hasLength(2));
        expect(makes[0].name, 'BMW');
        expect(makes[0].isPopular, isTrue);
        expect(makes[1].name, 'AUDI');
        expect(makes[1].logoUrl, 'https://example.com/audi.png');
      });

      test('returns empty list when response is null', () async {
        when(
          () => mockDio.get<List<dynamic>>(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: ''),
            data: null,
          ),
        );

        final makes = await repository.searchMakes();
        expect(makes, isEmpty);
      });
    });

    group('searchModels', () {
      test('returns list of CatalogVehicleModel filtered by makeId', () async {
        when(
          () => mockDio.get<List<dynamic>>(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: ''),
            data: [
              {
                'id': 'model-uuid-1',
                'makeId': 'uuid-1',
                'makeName': 'BMW',
                'name': '3 Series',
                'yearFrom': 2012,
                'yearTo': 2019,
              },
            ],
          ),
        );

        final models = await repository.searchModels('uuid-1', q: '3');

        expect(models, hasLength(1));
        expect(models[0].name, '3 Series');
        expect(models[0].makeId, 'uuid-1');
        expect(models[0].makeName, 'BMW');
        expect(models[0].yearFrom, 2012);
      });
    });

    group('getModifications', () {
      test('returns list of CatalogModification for modelId', () async {
        when(
          () => mockDio.get<List<dynamic>>(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => Response(
            requestOptions: RequestOptions(path: ''),
            data: [
              {
                'id': 'mod-uuid-1',
                'modelId': 'model-uuid-1',
                'name': '320d 2.0 TDI 150hp',
                'yearFrom': 2015,
                'yearTo': 2019,
                'engineType': 'diesel',
                'engineSizeCc': 1995,
                'powerKw': 110,
              },
            ],
          ),
        );

        final mods = await repository.getModifications('model-uuid-1');

        expect(mods, hasLength(1));
        expect(mods[0].name, '320d 2.0 TDI 150hp');
        expect(mods[0].engineType, 'diesel');
        expect(mods[0].engineSizeCc, 1995);
        expect(mods[0].powerKw, 110);
      });
    });
  });
}
