enum FleetVehicleStatus { green, yellow, red }

extension FleetVehicleStatusExtension on FleetVehicleStatus {
  static FleetVehicleStatus fromString(String value) {
    switch (value) {
      case 'green':
        return FleetVehicleStatus.green;
      case 'yellow':
        return FleetVehicleStatus.yellow;
      case 'red':
      default:
        return FleetVehicleStatus.red;
    }
  }
}

class FleetVehicle {
  final String id;
  final String vehicleId;
  final String licensePlate;
  final String make;
  final String model;
  final String? insurerName;
  final DateTime? policyExpiresAt;
  final String? activePolicyId;
  final FleetVehicleStatus status;

  const FleetVehicle({
    required this.id,
    required this.vehicleId,
    required this.licensePlate,
    required this.make,
    required this.model,
    this.insurerName,
    this.policyExpiresAt,
    this.activePolicyId,
    required this.status,
  });

  factory FleetVehicle.fromJson(Map<String, dynamic> json) {
    return FleetVehicle(
      id: json['id'] as String,
      vehicleId: json['vehicleId'] as String,
      licensePlate: json['licensePlate'] as String,
      make: json['make'] as String,
      model: json['model'] as String,
      insurerName: json['insurerName'] as String?,
      policyExpiresAt: json['policyExpiresAt'] != null
          ? DateTime.tryParse(json['policyExpiresAt'] as String)
          : null,
      activePolicyId: json['activePolicyId'] as String?,
      status: FleetVehicleStatusExtension.fromString(
        json['status'] as String? ?? 'red',
      ),
    );
  }
}
