import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../data/models/fleet_export_model.dart';
import '../data/repositories/fleet_export_repository.dart';

// ─── Events ──────────────────────────────────────────────────────────────────

abstract class FleetExportEvent {
  const FleetExportEvent();
}

class FleetExportStartedEvent extends FleetExportEvent {
  final List<String> policyIds;
  const FleetExportStartedEvent({required this.policyIds});
}

class FleetExportStatusPolledEvent extends FleetExportEvent {
  final String exportId;
  const FleetExportStatusPolledEvent({required this.exportId});
}

class FleetExportDownloadRequestedEvent extends FleetExportEvent {
  final String exportId;
  const FleetExportDownloadRequestedEvent({required this.exportId});
}

// ─── States ──────────────────────────────────────────────────────────────────

abstract class FleetExportState {
  const FleetExportState();
}

class FleetExportInitialState extends FleetExportState {
  const FleetExportInitialState();
}

class FleetExportLoadingState extends FleetExportState {
  const FleetExportLoadingState();
}

class FleetExportProcessingState extends FleetExportState {
  final FleetExportModel export;
  const FleetExportProcessingState({required this.export});
}

class FleetExportReadyState extends FleetExportState {
  final FleetExportModel export;
  final String? downloadUrl;
  const FleetExportReadyState({required this.export, this.downloadUrl});
}

class FleetExportFailedState extends FleetExportState {
  final String error;
  const FleetExportFailedState({required this.error});
}

// ─── Bloc ─────────────────────────────────────────────────────────────────────

class FleetExportBloc extends Bloc<FleetExportEvent, FleetExportState> {
  final FleetExportRepository _repository;
  Timer? _pollingTimer;

  FleetExportBloc({required FleetExportRepository repository})
      : _repository = repository,
        super(const FleetExportInitialState()) {
    on<FleetExportStartedEvent>(_onStarted);
    on<FleetExportStatusPolledEvent>(_onStatusPolled);
    on<FleetExportDownloadRequestedEvent>(_onDownloadRequested);
  }

  Future<void> _onStarted(
    FleetExportStartedEvent event,
    Emitter<FleetExportState> emit,
  ) async {
    emit(const FleetExportLoadingState());
    try {
      final export = await _repository.createBatchExport(event.policyIds);
      emit(FleetExportProcessingState(export: export));
      _startPolling(export.exportId);
    } catch (e) {
      emit(FleetExportFailedState(error: e.toString()));
    }
  }

  Future<void> _onStatusPolled(
    FleetExportStatusPolledEvent event,
    Emitter<FleetExportState> emit,
  ) async {
    try {
      final export = await _repository.getExportStatus(event.exportId);
      if (export.status.isTerminal) {
        _stopPolling();
        emit(FleetExportReadyState(export: export));
      } else {
        emit(FleetExportProcessingState(export: export));
      }
    } catch (e) {
      _stopPolling();
      emit(FleetExportFailedState(error: e.toString()));
    }
  }

  Future<void> _onDownloadRequested(
    FleetExportDownloadRequestedEvent event,
    Emitter<FleetExportState> emit,
  ) async {
    final currentState = state;
    if (currentState is! FleetExportReadyState) return;
    try {
      final url = await _repository.getDownloadUrl(event.exportId);
      emit(FleetExportReadyState(export: currentState.export, downloadUrl: url));
    } catch (e) {
      emit(FleetExportFailedState(error: e.toString()));
    }
  }

  void _startPolling(String exportId) {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => add(FleetExportStatusPolledEvent(exportId: exportId)),
    );
  }

  void _stopPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = null;
  }

  @override
  Future<void> close() {
    _stopPolling();
    return super.close();
  }
}
