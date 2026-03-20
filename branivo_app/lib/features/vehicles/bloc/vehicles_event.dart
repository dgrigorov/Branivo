import '../data/models/vehicle_model.dart';

abstract class VehiclesEvent {
  const VehiclesEvent();
}

class LoadVehicles extends VehiclesEvent {
  const LoadVehicles();
}

class SaveVehicle extends VehiclesEvent {
  const SaveVehicle(this.vehicle);

  final VehicleModel vehicle;
}

class SelectVehicle extends VehiclesEvent {
  const SelectVehicle(this.vehicle);

  final VehicleModel vehicle;
}
