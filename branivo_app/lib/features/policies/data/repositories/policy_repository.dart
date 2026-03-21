import 'package:dio/dio.dart';
import 'package:hive/hive.dart';
import '../models/policy_document.dart';

class PolicyDocumentUrls {
  final String policyPdfUrl;
  final String greenCardUrl;
  final String expiresAt;

  const PolicyDocumentUrls({
    required this.policyPdfUrl,
    required this.greenCardUrl,
    required this.expiresAt,
  });

  factory PolicyDocumentUrls.fromJson(Map<String, dynamic> json) {
    return PolicyDocumentUrls(
      policyPdfUrl: json['policyPdfUrl'] as String,
      greenCardUrl: json['greenCardUrl'] as String,
      expiresAt: json['expiresAt'] as String,
    );
  }
}

class PolicyRepository {
  final Dio _dio;
  final String bearerToken;
  final Box<PolicyDocument>? _cacheBox;

  const PolicyRepository({
    required Dio dio,
    required this.bearerToken,
    Box<PolicyDocument>? cacheBox,
  })  : _dio = dio,
        _cacheBox = cacheBox;

  /// Fetch policy list. Falls back to Hive cache if API call fails.
  Future<List<PolicyDocument>> getPolicies() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/policies',
        options: Options(headers: {'Authorization': 'Bearer $bearerToken'}),
      );
      final data = response.data!['data'] as List<dynamic>;
      final policies = data
          .cast<Map<String, dynamic>>()
          .map(PolicyDocument.fromJson)
          .toList();

      // Update Hive cache
      if (_cacheBox != null) {
        await _cacheBox.clear();
        for (final policy in policies) {
          await _cacheBox.put(policy.policyId, policy);
        }
      }
      return policies;
    } catch (_) {
      // Offline fallback — serve from Hive cache
      if (_cacheBox != null && _cacheBox.isNotEmpty) {
        return _cacheBox.values.toList();
      }
      rethrow;
    }
  }

  /// Fetch presigned document URLs for a specific policy.
  Future<PolicyDocumentUrls> getDocumentUrls(String policyId) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/v1/policies/$policyId/documents',
      options: Options(headers: {'Authorization': 'Bearer $bearerToken'}),
    );
    return PolicyDocumentUrls.fromJson(response.data!);
  }

  /// Fetch shipment tracking info for a policy. Returns null if no shipment exists.
  Future<Map<String, dynamic>?> getShipment(String policyId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/api/v1/policies/$policyId/shipment',
        options: Options(headers: {'Authorization': 'Bearer $bearerToken'}),
      );
      return response.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }
}
