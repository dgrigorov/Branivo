import 'package:dio/dio.dart';
import '../models/fleet_vehicle.dart';

class FleetRepository {
  final Dio _dio;

  const FleetRepository({required Dio dio}) : _dio = dio;

  Future<List<FleetVehicle>> getFleetVehicles({
    FleetVehicleStatus? status,
    int page = 1,
    int limit = 50,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (status != null) {
      params['status'] = status.name;
    }

    final response = await _dio.get<Map<String, dynamic>>(
      '/fleet/vehicles',
      queryParameters: params,
    );

    final body = response.data;
    if (body == null) return [];

    final dataList = body['data'] as List<dynamic>? ?? [];
    return dataList
        .map((e) => FleetVehicle.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
