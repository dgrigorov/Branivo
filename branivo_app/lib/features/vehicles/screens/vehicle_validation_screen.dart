import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/vehicle_validation_bloc.dart';

class VehicleValidationScreen extends StatelessWidget {
  const VehicleValidationScreen({
    super.key,
    required this.vin,
    required this.licensePlate,
  });

  final String vin;
  final String licensePlate;

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<VehicleValidationBloc, VehicleValidationState>(
      listener: (context, state) {
        if (state is VehicleValidationSuccess && state.result.canProceedToQuote) {
          // Navigate to Quote flow (Epic 4)
          // Navigator.pushNamed(context, '/quotes');
        }
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(title: const Text('Валидация на МПС')),
          body: Semantics(
            label: 'Статус на валидация',
            child: _buildBody(context, state),
          ),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, VehicleValidationState state) {
    if (state is VehicleValidationInitial) {
      return _buildInitialView(context);
    }
    if (state is VehicleValidationLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state is VehicleValidationGfBlocked) {
      return _buildGfBlockedView(context, state.reason);
    }
    if (state is VehicleValidationKatFallback) {
      return _buildKatFallbackView(context, state.message);
    }
    if (state is VehicleValidationSuccess) {
      return _buildSuccessView(context, state);
    }
    if (state is VehicleValidationError) {
      return _buildErrorView(context, state.message);
    }
    return const SizedBox.shrink();
  }

  Widget _buildInitialView(BuildContext context) {
    return Center(
      child: ElevatedButton(
        onPressed: () {
          context.read<VehicleValidationBloc>().add(
                ValidateVehicleEvent(vin: vin, licensePlate: licensePlate),
              );
        },
        child: const Text('Валидирай МПС'),
      ),
    );
  }

  Widget _buildGfBlockedView(BuildContext context, String reason) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              border: Border.all(color: Colors.red),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              reason,
              style: TextStyle(color: Colors.red.shade900),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Назад'),
          ),
        ],
      ),
    );
  }

  Widget _buildKatFallbackView(BuildContext context, String message) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(message, style: const TextStyle(color: Colors.orange)),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () {
              context.read<VehicleValidationBloc>().add(
                    KatManualConfirmEvent(
                      vin: vin,
                      licensePlate: licensePlate,
                    ),
                  );
            },
            child: const Text('Продължи'),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessView(BuildContext context, VehicleValidationSuccess state) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 48),
          const SizedBox(height: 8),
          Text('КАТ: ${state.result.katStatus}'),
          Text('Гаранционен фонд: ${state.result.gfStatus}'),
          if (state.result.canProceedToQuote) ...[
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                // Navigate to Epic 4 quotes
              },
              child: const Text('Продължи към оферти'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildErrorView(BuildContext context, String message) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(message, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () {
              context.read<VehicleValidationBloc>().add(
                    ValidateVehicleEvent(vin: vin, licensePlate: licensePlate),
                  );
            },
            child: const Text('Опитай отново'),
          ),
        ],
      ),
    );
  }
}
