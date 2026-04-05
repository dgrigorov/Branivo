import 'package:dio/dio.dart';
import '../../../../core/api/endpoints.dart';
import '../models/catalog_make_model.dart';

class VehicleCatalogRepository {
  VehicleCatalogRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<List<CatalogMake>> searchMakes({String? q, int limit = 200}) async {
    final resp = await _dio.get<List<dynamic>>(
      ApiEndpoints.vehicleCatalogMakes,
      queryParameters: {
        if (q != null && q.isNotEmpty) 'q': q,
        'limit': limit,
      },
    );
    return (resp.data ?? [])
        .map((e) => CatalogMake.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CatalogVehicleModel>> searchModels(
    String makeId, {
    String? q,
    int limit = 200,
  }) async {
    final resp = await _dio.get<List<dynamic>>(
      ApiEndpoints.vehicleCatalogModels,
      queryParameters: {
        'makeId': makeId,
        if (q != null && q.isNotEmpty) 'q': q,
        'limit': limit,
      },
    );
    return (resp.data ?? [])
        .map((e) => CatalogVehicleModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CatalogModification>> getModifications(
    String modelId, {
    int limit = 100,
  }) async {
    final resp = await _dio.get<List<dynamic>>(
      ApiEndpoints.vehicleCatalogModifications,
      queryParameters: {'modelId': modelId, 'limit': limit},
    );
    return (resp.data ?? [])
        .map((e) => CatalogModification.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
