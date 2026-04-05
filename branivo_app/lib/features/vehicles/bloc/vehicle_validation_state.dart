part of 'vehicle_validation_bloc.dart';

abstract class VehicleValidationState {
  const VehicleValidationState();
}

class VehicleValidationInitial extends VehicleValidationState {
  const VehicleValidationInitial();
}

class VehicleValidationLoading extends VehicleValidationState {
  const VehicleValidationLoading();
}

class VehicleValidationSuccess extends VehicleValidationState {
  const VehicleValidationSuccess(this.result);
  final VehicleValidationResult result;
}

class VehicleValidationGfBlocked extends VehicleValidationState {
  const VehicleValidationGfBlocked(this.reason);
  final String reason;
}

class VehicleValidationKatFallback extends VehicleValidationState {
  const VehicleValidationKatFallback(this.message);
  final String message;
}

class VehicleValidationGfUnavailable extends VehicleValidationState {
  const VehicleValidationGfUnavailable();
}

class VehicleValidationError extends VehicleValidationState {
  const VehicleValidationError(this.message);
  final String message;
}
