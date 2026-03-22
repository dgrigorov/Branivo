import '../data/models/fleet_vehicle.dart';

abstract class FleetEvent {
  const FleetEvent();
}

class FleetLoadRequested extends FleetEvent {
  final FleetVehicleStatus? statusFilter;

  const FleetLoadRequested({this.statusFilter});
}

class FleetStatusFilterChanged extends FleetEvent {
  final FleetVehicleStatus? statusFilter;

  const FleetStatusFilterChanged({this.statusFilter});
}

class DriverVehiclesRequested extends FleetEvent {
  const DriverVehiclesRequested();
}
