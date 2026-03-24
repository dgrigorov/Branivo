class VehicleModel {
  const VehicleModel({
    required this.id,
    required this.tenantId,
    required this.ownerId,
    required this.vin,
    required this.licensePlate,
    required this.make,
    required this.model,
    required this.year,
    this.color,
    this.engineVolume,
    this.fuelType,
    this.firstRegistrationDate,
    required this.createdAt,
    required this.updatedAt,
    this.lastPolicyStatus,
  });

  factory VehicleModel.fromJson(Map<String, dynamic> json) {
    return VehicleModel(
      id: json['id'] as String,
      tenantId: (json['tenantId'] ?? json['tenant_id']) as String,
      ownerId: (json['ownerId'] ?? json['owner_id']) as String,
      vin: json['vin'] as String,
      licensePlate: (json['licensePlate'] ?? json['license_plate']) as String,
      make: json['make'] as String,
      model: json['model'] as String,
      year: json['year'] as int,
      color: (json['color']) as String?,
      engineVolume: (json['engineVolume'] ?? json['engine_volume']) as String?,
      fuelType: (json['fuelType'] ?? json['fuel_type']) as String?,
      firstRegistrationDate: (json['firstRegistrationDate'] ?? json['first_registration_date']) as String?,
      createdAt: (json['createdAt'] ?? json['created_at']) as String,
      updatedAt: (json['updatedAt'] ?? json['updated_at']) as String,
      lastPolicyStatus: (json['lastPolicyStatus'] ?? json['last_policy_status']) as String?,
    );
  }

  final String id;
  final String tenantId;
  final String ownerId;
  final String vin;
  final String licensePlate;
  final String make;
  final String model;
  final int year;
  final String? color;
  final String? engineVolume;
  final String? fuelType;
  final String? firstRegistrationDate;
  final String createdAt;
  final String updatedAt;
  final String? lastPolicyStatus;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'tenant_id': tenantId,
      'owner_id': ownerId,
      'vin': vin,
      'license_plate': licensePlate,
      'make': make,
      'model': model,
      'year': year,
      if (color != null) 'color': color,
      if (engineVolume != null) 'engine_volume': engineVolume,
      if (fuelType != null) 'fuel_type': fuelType,
      if (firstRegistrationDate != null)
        'first_registration_date': firstRegistrationDate,
      'created_at': createdAt,
      'updated_at': updatedAt,
      if (lastPolicyStatus != null) 'last_policy_status': lastPolicyStatus,
    };
  }
}
