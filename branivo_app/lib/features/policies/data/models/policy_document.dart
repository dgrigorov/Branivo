import 'package:hive/hive.dart';

part 'policy_document.g.dart';

@HiveType(typeId: 10)
class PolicyDocument extends HiveObject {
  @HiveField(0)
  String policyId;

  @HiveField(1)
  String policyNumber;

  @HiveField(2)
  String status;

  @HiveField(3)
  DateTime? coverageStartDate;

  @HiveField(4)
  DateTime? coverageEndDate;

  @HiveField(5)
  double premiumAmount;

  @HiveField(6)
  String currency;

  @HiveField(7)
  DateTime cachedAt;

  PolicyDocument({
    required this.policyId,
    required this.policyNumber,
    required this.status,
    this.coverageStartDate,
    this.coverageEndDate,
    required this.premiumAmount,
    required this.currency,
    required this.cachedAt,
  });

  factory PolicyDocument.fromJson(Map<String, dynamic> json) {
    return PolicyDocument(
      policyId: json['id'] as String,
      policyNumber: json['policyNumber'] as String,
      status: json['status'] as String,
      coverageStartDate: json['coverageStartDate'] != null
          ? DateTime.tryParse(json['coverageStartDate'] as String)
          : null,
      coverageEndDate: json['coverageEndDate'] != null
          ? DateTime.tryParse(json['coverageEndDate'] as String)
          : null,
      premiumAmount: (json['premiumAmount'] as num).toDouble(),
      currency: json['currency'] as String? ?? 'BGN',
      cachedAt: DateTime.now(),
    );
  }
}
