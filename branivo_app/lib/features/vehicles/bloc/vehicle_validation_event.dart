part of 'vehicle_validation_bloc.dart';

abstract class VehicleValidationEvent {
  const VehicleValidationEvent();
}

class ValidateVehicleEvent extends VehicleValidationEvent {
  const ValidateVehicleEvent({
    required this.vin,
    required this.licensePlate,
  });

  final String vin;
  final String licensePlate;
}

class KatManualConfirmEvent extends VehicleValidationEvent {
  const KatManualConfirmEvent({
    required this.vin,
    required this.licensePlate,
  });

  final String vin;
  final String licensePlate;
}

class ValidationResetEvent extends VehicleValidationEvent {
  const ValidationResetEvent();
}
