import 'dart:developer';

import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/repositories/vehicle_api_repository.dart';

part 'vehicle_validation_event.dart';
part 'vehicle_validation_state.dart';

class VehicleValidationBloc
    extends Bloc<VehicleValidationEvent, VehicleValidationState> {
  VehicleValidationBloc({required VehicleApiRepository repository})
      : _repository = repository,
        super(const VehicleValidationInitial()) {
    on<ValidateVehicleEvent>(_onValidate);
    on<KatManualConfirmEvent>(_onKatManualConfirm);
    on<ValidationResetEvent>(_onReset);
  }

  final VehicleApiRepository _repository;

  Future<void> _onValidate(
    ValidateVehicleEvent event,
    Emitter<VehicleValidationState> emit,
  ) async {
    emit(const VehicleValidationLoading());
    try {
      final result = await _repository.validateVehicle(
        event.vin,
        event.licensePlate,
      );
      if (result.katStatus == 'manual_fallback') {
        emit(VehicleValidationKatFallback(
          'Не успяхме да верифицираме VIN автоматично. Моля, проверете ръчно.',
        ));
      } else if (result.gfStatus == 'unavailable') {
        emit(const VehicleValidationGfUnavailable());
      } else {
        emit(VehicleValidationSuccess(result));
      }
    } on VehicleGfBlockedException {
      emit(const VehicleValidationGfBlocked(
        'Проверката на МПС показа нередност. Моля, свържете се с брокера.',
      ));
    } on VehicleVinInvalidException {
      emit(const VehicleValidationError('VIN невалиден формат'));
    } catch (e) {
      log('VehicleValidationBloc error', error: e);
      emit(const VehicleValidationError('Грешка при валидация. Моля, опитайте отново.'));
    }
  }

  Future<void> _onKatManualConfirm(
    KatManualConfirmEvent event,
    Emitter<VehicleValidationState> emit,
  ) async {
    emit(const VehicleValidationLoading());
    try {
      final result = await _repository.validateVehicle(
        event.vin,
        event.licensePlate,
        katManuallyConfirmed: true,
      );
      if (result.gfStatus == 'unavailable') {
        emit(const VehicleValidationGfUnavailable());
      } else {
        emit(VehicleValidationSuccess(result));
      }
    } on VehicleGfBlockedException {
      emit(const VehicleValidationGfBlocked(
        'Проверката на МПС показа нередност. Моля, свържете се с брокера.',
      ));
    } catch (e) {
      log('VehicleValidationBloc KatManualConfirm error', error: e);
      emit(const VehicleValidationError('Грешка при валидация. Моля, опитайте отново.'));
    }
  }

  void _onReset(
    ValidationResetEvent event,
    Emitter<VehicleValidationState> emit,
  ) {
    emit(const VehicleValidationInitial());
  }
}
