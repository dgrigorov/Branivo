import 'dart:developer';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/models/vehicle_model.dart';
import '../data/repositories/vehicles_repository.dart';
import 'vehicles_event.dart';
import 'vehicles_state.dart';

class VehiclesBloc extends Bloc<VehiclesEvent, VehiclesState> {
  VehiclesBloc({required VehiclesRepository repository})
      : _repository = repository,
        super(const VehiclesLoading()) {
    on<LoadVehicles>(_onLoadVehicles);
    on<SaveVehicle>(_onSaveVehicle);
    on<SelectVehicle>(_onSelectVehicle);
  }

  final VehiclesRepository _repository;
  VehicleModel? _selectedVehicle;

  VehicleModel? get selectedVehicle => _selectedVehicle;

  Future<void> _onLoadVehicles(
    LoadVehicles event,
    Emitter<VehiclesState> emit,
  ) async {
    emit(const VehiclesLoading());
    try {
      final vehicles = await _repository.listVehicles();
      if (vehicles.isEmpty) {
        emit(const VehiclesEmpty());
      } else {
        emit(VehiclesLoaded(vehicles));
      }
    } on VehiclesRepositoryException catch (e) {
      log('VehiclesBloc: load error', error: e);
      emit(VehiclesError(e.message));
    }
  }

  Future<void> _onSaveVehicle(
    SaveVehicle event,
    Emitter<VehiclesState> emit,
  ) async {
    emit(const VehiclesLoading());
    try {
      final saved = await _repository.saveVehicle(event.vehicle);
      emit(VehiclesSaveSuccess(saved));
    } on VehiclesRepositoryException catch (e) {
      log('VehiclesBloc: save error', error: e);
      emit(VehiclesError(e.message));
    }
  }

  void _onSelectVehicle(
    SelectVehicle event,
    Emitter<VehiclesState> emit,
  ) {
    _selectedVehicle = event.vehicle;
    final current = state;
    if (current is VehiclesLoaded) {
      emit(VehiclesLoaded(current.vehicles));
    }
  }
}
