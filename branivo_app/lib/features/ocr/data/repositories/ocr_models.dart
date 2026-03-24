enum OcrJobStatus { pending, processing, completed, failed }

enum OcrProvider { googleVision, awsTextract, mlKit }

class OcrField {
  const OcrField({
    required this.value,
    required this.confidence,
    required this.autoFilled,
  });

  factory OcrField.fromJson(Map<String, dynamic> json) => OcrField(
        value: json['value'] as String?,
        confidence: (json['confidence'] as num).toDouble(),
        autoFilled: json['auto_filled'] as bool? ?? false,
      );

  final String? value;
  final double confidence;
  final bool autoFilled;

  bool get isLowConfidence => confidence < 0.85;
}

class OcrScanResponse {
  const OcrScanResponse({
    required this.jobId,
    required this.status,
    this.provider,
    this.fields,
    this.avgConfidence,
  });

  factory OcrScanResponse.fromJson(Map<String, dynamic> json) {
    final statusStr = json['status'] as String;
    final status = OcrJobStatus.values.firstWhere(
      (e) => e.name == statusStr,
      orElse: () => OcrJobStatus.processing,
    );

    Map<String, OcrField>? fields;
    if (json['fields'] != null) {
      fields = (json['fields'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(k, OcrField.fromJson(v as Map<String, dynamic>)),
      );
    }

    return OcrScanResponse(
      jobId: json['jobId'] as String,
      status: status,
      fields: fields,
      avgConfidence: json['avgConfidence'] != null
          ? (json['avgConfidence'] as num).toDouble()
          : null,
    );
  }

  final String jobId;
  final OcrJobStatus status;
  final OcrProvider? provider;
  final Map<String, OcrField>? fields;
  final double? avgConfidence;
}
