import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/vehicle_model.dart';

class VehiclesRepositoryException implements Exception {
  const VehiclesRepositoryException(this.message);

  final String message;

  @override
  String toString() => 'VehiclesRepositoryException: $message';
}

class VehiclesRepository {
  VehiclesRepository({
    required Dio dio,
    required FlutterSecureStorage storage,
  })  : _dio = dio,
        _storage = storage;

  final Dio _dio;
  final FlutterSecureStorage _storage;

  Future<Options> _authOptions() async {
    final token = await _storage.read(key: 'auth_token') ?? '';
    return Options(headers: {'Authorization': 'Bearer $token'});
  }

  Future<List<VehicleModel>> listVehicles() async {
    try {
      final options = await _authOptions();
      final response = await _dio.get<List<dynamic>>(
        '/api/v1/vehicles',
        options: options,
      );

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
      final options = await _authOptions();
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/vehicles',
        data: vehicle.toJson(),
        options: options,
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
      final options = await _authOptions();
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/vehicles/$id',
        options: options,
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
