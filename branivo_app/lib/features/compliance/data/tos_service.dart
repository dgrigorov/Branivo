import 'package:dio/dio.dart';
import '../../../core/api/endpoints.dart';

class TosVersionData {
  final String id;
  final int version;
  final String content;
  final String language;
  final String? publishedAt;

  const TosVersionData({
    required this.id,
    required this.version,
    required this.content,
    required this.language,
    this.publishedAt,
  });

  factory TosVersionData.fromJson(Map<String, dynamic> json) {
    return TosVersionData(
      id: json['id'] as String,
      version: json['version'] as int,
      content: json['content'] as String,
      language: json['language'] as String,
      publishedAt: json['publishedAt'] as String?,
    );
  }
}

class TosStatusData {
  final bool requiresAcceptance;
  final TosVersionData? currentVersion;
  final int? acceptedVersion;

  const TosStatusData({
    required this.requiresAcceptance,
    this.currentVersion,
    this.acceptedVersion,
  });

  factory TosStatusData.fromJson(Map<String, dynamic> json) {
    final currentVersionJson =
        json['currentVersion'] as Map<String, dynamic>?;
    return TosStatusData(
      requiresAcceptance: json['requiresAcceptance'] as bool,
      currentVersion: currentVersionJson != null
          ? TosVersionData.fromJson(currentVersionJson)
          : null,
      acceptedVersion: json['acceptedVersion'] as int?,
    );
  }
}

class TosService {
  TosService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<TosVersionData> fetchPublished({String lang = 'bg'}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.tos(lang: lang),
      options: Options(extra: {'skipAuth': true}),
    );
    final body = response.data;
    if (body == null) {
      throw Exception('Empty response from ToS endpoint');
    }
    return TosVersionData.fromJson(body);
  }

  Future<TosStatusData> getStatus() async {
    final response = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.tosStatus,
    );
    final body = response.data;
    if (body == null) {
      throw Exception('Empty response from ToS status endpoint');
    }
    return TosStatusData.fromJson(body);
  }

  Future<void> accept({required String tosVersionId}) async {
    await _dio.post<Map<String, dynamic>>(
      ApiEndpoints.tosAccept,
      data: {'tosVersionId': tosVersionId},
    );
  }
}
