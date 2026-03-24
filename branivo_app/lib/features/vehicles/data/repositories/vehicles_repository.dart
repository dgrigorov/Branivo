import 'package:dio/dio.dart';
import '../models/vehicle_model.dart';

class VehiclesRepositoryException implements Exception {
  const VehiclesRepositoryException(this.message);

  final String message;

  @override
  String toString() => 'VehiclesRepositoryException: $message';
}

class VehiclesRepository {
  VehiclesRepository({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<List<VehicleModel>> listVehicles() async {
    try {
      final response = await _dio.get<List<dynamic>>('/api/v1/vehicles');
      final data = response.data ?? [];
      return data
          .cast<Map<String, dynamic>>()
          .map(VehicleModel.fromJson)
          .toList();
    } on DioException catch (e) {
      throw VehiclesRepositoryException(
        'Failed to list vehicles: ${e.message}',
      );
    }
  }

  Future<VehicleModel> saveVehicle(VehicleModel vehicle) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/vehicles',
        data: vehicle.toJson(),
      );
      return VehicleModel.fromJson(response.data!);
    } on DioException catch (e) {
      throw VehiclesRepositoryException(
        'Failed to save vehicle: ${e.message}',
      );
    }
  }

  Future<VehicleModel?> getVehicle(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/vehicles/$id',
      );
      return VehicleModel.fromJson(response.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      throw VehiclesRepositoryException(
        'Failed to get vehicle: ${e.message}',
      );
    }
  }
}
