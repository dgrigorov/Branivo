import 'package:dio/dio.dart';
import '../models/fleet_export_model.dart';

class FleetExportRepository {
  final Dio _dio;

  const FleetExportRepository({required Dio dio}) : _dio = dio;

  Future<FleetExportModel> createBatchExport(List<String> policyIds) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/fleet/exports',
      data: {'policyIds': policyIds},
    );
    return FleetExportModel.fromJson(response.data!);
  }

  Future<FleetExportModel> getExportStatus(String exportId) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/fleet/exports/$exportId',
    );
    return FleetExportModel.fromJson(response.data!);
  }

  Future<String> getDownloadUrl(String exportId) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/fleet/exports/$exportId/download',
    );
    return response.data!['downloadUrl'] as String;
  }
}
