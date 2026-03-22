import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/repositories/fleet_repository.dart';
import 'fleet_event.dart';
import 'fleet_state.dart';

class FleetBloc extends Bloc<FleetEvent, FleetState> {
  final FleetRepository fleetRepository;

  FleetBloc({required this.fleetRepository}) : super(const FleetInitial()) {
    on<FleetLoadRequested>(_onLoadRequested);
    on<FleetStatusFilterChanged>(_onFilterChanged);
  }

  Future<void> _onLoadRequested(
    FleetLoadRequested event,
    Emitter<FleetState> emit,
  ) async {
    emit(const FleetLoading());
    try {
      final vehicles = await fleetRepository.getFleetVehicles(
        status: event.statusFilter,
      );
      emit(FleetLoaded(
        vehicles: vehicles,
        activeFilter: event.statusFilter,
      ));
    } catch (e) {
      emit(FleetError(message: 'Грешка при зареждане на флота: $e'));
    }
  }

  Future<void> _onFilterChanged(
    FleetStatusFilterChanged event,
    Emitter<FleetState> emit,
  ) async {
    emit(const FleetLoading());
    try {
      final vehicles = await fleetRepository.getFleetVehicles(
        status: event.statusFilter,
      );
      emit(FleetLoaded(
        vehicles: vehicles,
        activeFilter: event.statusFilter,
      ));
    } catch (e) {
      emit(FleetError(message: 'Грешка при зареждане на флота: $e'));
    }
  }
}
