import '../data/models/fleet_vehicle.dart';
import '../data/models/driver_vehicle.dart';

abstract class FleetState {
  const FleetState();
}

class FleetInitial extends FleetState {
  const FleetInitial();
}

class FleetLoading extends FleetState {
  const FleetLoading();
}

class FleetLoaded extends FleetState {
  final List<FleetVehicle> vehicles;
  final FleetVehicleStatus? activeFilter;

  const FleetLoaded({
    required this.vehicles,
    this.activeFilter,
  });
}

class FleetError extends FleetState {
  final String message;

  const FleetError({required this.message});
}

class DriverVehicleLoaded extends FleetState {
  final List<DriverVehicle> vehicles;

  const DriverVehicleLoaded({required this.vehicles});
}
