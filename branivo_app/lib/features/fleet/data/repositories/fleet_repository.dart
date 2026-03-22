import 'package:dio/dio.dart';
import '../models/fleet_vehicle.dart';
import '../models/bulk_quote_models.dart';
import '../models/driver_vehicle.dart';

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

  Future<BulkQuoteResponse> bulkGetQuotes(List<String> vehicleIds) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/fleet/bulk-quotes',
      data: {'vehicleIds': vehicleIds},
    );

    final body = response.data;
    if (body == null) return const BulkQuoteResponse(results: []);

    return BulkQuoteResponse.fromJson(body);
  }

  Future<List<DriverVehicle>> getDriverVehicles() async {
    final response = await _dio.get<List<dynamic>>(
      '/fleet/driver/vehicles',
    );

    final dataList = response.data ?? [];
    return dataList
        .map((e) => DriverVehicle.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<BulkPurchaseResponse> bulkPurchase(
    List<BulkPurchaseItem> items,
  ) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/fleet/bulk-purchase',
      data: {'items': items.map((i) => i.toJson()).toList()},
    );

    final body = response.data;
    if (body == null) {
      return BulkPurchaseResponse(
        succeeded: [],
        failed: [],
        summary: const BulkPurchaseSummary(
          total: 0,
          succeeded: 0,
          failed: 0,
        ),
      );
    }

    return BulkPurchaseResponse.fromJson(body);
  }
}
