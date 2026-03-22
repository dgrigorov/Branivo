enum FleetExportStatus {
  pending,
  processing,
  assembling,
  completed,
  partial,
  failed;

  static FleetExportStatus fromString(String value) {
    switch (value) {
      case 'pending':
        return FleetExportStatus.pending;
      case 'processing':
        return FleetExportStatus.processing;
      case 'assembling':
        return FleetExportStatus.assembling;
      case 'completed':
        return FleetExportStatus.completed;
      case 'partial':
        return FleetExportStatus.partial;
      case 'failed':
      default:
        return FleetExportStatus.failed;
    }
  }

  bool get isTerminal =>
      this == FleetExportStatus.completed ||
      this == FleetExportStatus.partial ||
      this == FleetExportStatus.failed;
}

class FleetPdfFailedItem {
  final String policyId;
  final String error;

  const FleetPdfFailedItem({required this.policyId, required this.error});

  factory FleetPdfFailedItem.fromJson(Map<String, dynamic> json) {
    return FleetPdfFailedItem(
      policyId: json['policyId'] as String,
      error: json['error'] as String,
    );
  }
}

class FleetExportModel {
  final String exportId;
  final FleetExportStatus status;
  final int totalCount;
  final int completedCount;
  final int failedCount;
  final List<FleetPdfFailedItem> failedPolicyIds;
  final String? zipS3Key;
  final DateTime? expiresAt;

  const FleetExportModel({
    required this.exportId,
    required this.status,
    required this.totalCount,
    required this.completedCount,
    required this.failedCount,
    required this.failedPolicyIds,
    this.zipS3Key,
    this.expiresAt,
  });

  factory FleetExportModel.fromJson(Map<String, dynamic> json) {
    final failedList = (json['failedPolicyIds'] as List<dynamic>? ?? [])
        .map((e) => FleetPdfFailedItem.fromJson(e as Map<String, dynamic>))
        .toList();

    return FleetExportModel(
      exportId: json['exportId'] as String,
      status: FleetExportStatus.fromString(json['status'] as String? ?? 'failed'),
      totalCount: json['totalCount'] as int? ?? 0,
      completedCount: json['completedCount'] as int? ?? 0,
      failedCount: json['failedCount'] as int? ?? 0,
      failedPolicyIds: failedList,
      zipS3Key: json['zipS3Key'] as String?,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'] as String)
          : null,
    );
  }
}
