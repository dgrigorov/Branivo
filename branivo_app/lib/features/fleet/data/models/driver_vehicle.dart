class DriverVehicle {
  final String vehicleId;
  final String licensePlate;
  final String make;
  final String model;
  final String? insurerName;
  final DateTime? policyExpiresAt;
  final String? policyStatus;

  const DriverVehicle({
    required this.vehicleId,
    required this.licensePlate,
    required this.make,
    required this.model,
    this.insurerName,
    this.policyExpiresAt,
    this.policyStatus,
  });

  factory DriverVehicle.fromJson(Map<String, dynamic> json) {
    return DriverVehicle(
      vehicleId: json['vehicleId'] as String,
      licensePlate: json['licensePlate'] as String,
      make: json['make'] as String,
      model: json['model'] as String,
      insurerName: json['insurerName'] as String?,
      policyExpiresAt: json['policyExpiresAt'] != null
          ? DateTime.tryParse(json['policyExpiresAt'] as String)
          : null,
      policyStatus: json['policyStatus'] as String?,
    );
  }
}
