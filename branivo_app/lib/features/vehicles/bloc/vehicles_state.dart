import '../data/models/vehicle_model.dart';

abstract class VehiclesState {
  const VehiclesState();
}

class VehiclesLoading extends VehiclesState {
  const VehiclesLoading();
}

class VehiclesLoaded extends VehiclesState {
  const VehiclesLoaded(this.vehicles);

  final List<VehicleModel> vehicles;
}

class VehiclesEmpty extends VehiclesState {
  const VehiclesEmpty();
}

class VehiclesSaveSuccess extends VehiclesState {
  const VehiclesSaveSuccess(this.vehicle);

  final VehicleModel vehicle;
}

class VehiclesError extends VehiclesState {
  const VehiclesError(this.message);

  final String message;
}
