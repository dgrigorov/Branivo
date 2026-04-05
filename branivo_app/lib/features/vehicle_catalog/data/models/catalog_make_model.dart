class CatalogMake {
  const CatalogMake({
    required this.id,
    required this.name,
    this.logoUrl,
    required this.isPopular,
  });

  factory CatalogMake.fromJson(Map<String, dynamic> json) => CatalogMake(
        id: json['id'] as String,
        name: json['name'] as String,
        logoUrl: json['logoUrl'] as String?,
        isPopular: json['isPopular'] as bool? ?? false,
      );

  final String id;
  final String name;
  final String? logoUrl;
  final bool isPopular;
}

class CatalogVehicleModel {
  const CatalogVehicleModel({
    required this.id,
    required this.makeId,
    required this.makeName,
    required this.name,
    this.imageUrl,
    this.yearFrom,
    this.yearTo,
  });

  factory CatalogVehicleModel.fromJson(Map<String, dynamic> json) =>
      CatalogVehicleModel(
        id: json['id'] as String,
        makeId: json['makeId'] as String,
        makeName: json['makeName'] as String,
        name: json['name'] as String,
        imageUrl: json['imageUrl'] as String?,
        yearFrom: json['yearFrom'] as int?,
        yearTo: json['yearTo'] as int?,
      );

  final String id;
  final String makeId;
  final String makeName;
  final String name;
  final String? imageUrl;
  final int? yearFrom;
  final int? yearTo;
}

class CatalogModification {
  const CatalogModification({
    required this.id,
    required this.modelId,
    required this.name,
    this.yearFrom,
    this.yearTo,
    this.engineType,
    this.engineSizeCc,
    this.powerKw,
  });

  factory CatalogModification.fromJson(Map<String, dynamic> json) =>
      CatalogModification(
        id: json['id'] as String,
        modelId: json['modelId'] as String,
        name: json['name'] as String,
        yearFrom: json['yearFrom'] as int?,
        yearTo: json['yearTo'] as int?,
        engineType: json['engineType'] as String?,
        engineSizeCc: json['engineSizeCc'] as int?,
        powerKw: json['powerKw'] as int?,
      );

  final String id;
  final String modelId;
  final String name;
  final int? yearFrom;
  final int? yearTo;
  final String? engineType;
  final int? engineSizeCc;
  final int? powerKw;
}

class VehicleCatalogSelection {
  const VehicleCatalogSelection({
    required this.makeId,
    required this.makeName,
    this.modelId,
    this.modelName,
    this.modificationId,
    this.modificationName,
    this.yearFrom,
    this.yearTo,
    this.engineType,
    this.engineSizeCc,
    this.powerKw,
  });

  final String makeId;
  final String makeName;
  final String? modelId;
  final String? modelName;
  final String? modificationId;
  final String? modificationName;
  final int? yearFrom;
  final int? yearTo;
  final String? engineType;
  final int? engineSizeCc;
  final int? powerKw;
}
