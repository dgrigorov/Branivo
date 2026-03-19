import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class VehicleGfBlockedException implements Exception {
  const VehicleGfBlockedException();

  @override
  String toString() => 'VehicleGfBlockedException';
}

class VehicleVinInvalidException implements Exception {
  const VehicleVinInvalidException();

  @override
  String toString() => 'VehicleVinInvalidException';
}

class VehicleValidationResult {
  const VehicleValidationResult({
    required this.canProceedToQuote,
    required this.katStatus,
    required this.gfStatus,
    required this.vinValid,
    required this.validatedAt,
  });

  factory VehicleValidationResult.fromJson(Map<String, dynamic> json) {
    return VehicleValidationResult(
      canProceedToQuote: json['canProceedToQuote'] as bool,
      katStatus: json['katStatus'] as String,
      gfStatus: json['gfStatus'] as String,
      vinValid: json['vinValid'] as bool,
      validatedAt: json['validatedAt'] as String,
    );
  }

  final bool canProceedToQuote;
  final String katStatus;
  final String gfStatus;
  final bool vinValid;
  final String validatedAt;
}

class VehicleApiRepository {
  VehicleApiRepository({
    required Dio dio,
    required FlutterSecureStorage storage,
  })  : _dio = dio,
        _storage = storage;

  final Dio _dio;
  final FlutterSecureStorage _storage;

  Future<VehicleValidationResult> validateVehicle(
    String vin,
    String licensePlate, {
    bool? katManuallyConfirmed,
  }) async {
    final sessionToken = await _storage.read(key: 'session_token') ?? '';

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/v1/vehicles/validate',
        data: {
          'vin': vin,
          'licensePlate': licensePlate,
          if (katManuallyConfirmed != null)
            'katManuallyConfirmed': katManuallyConfirmed,
        },
        options: Options(
          headers: {'X-Session-Token': sessionToken},
        ),
      );

      return VehicleValidationResult.fromJson(response.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) {
        throw const VehicleGfBlockedException();
      }
      if (e.response?.statusCode == 422) {
        throw const VehicleVinInvalidException();
      }
      rethrow;
    }
  }
}
