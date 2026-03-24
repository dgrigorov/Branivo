import 'dart:developer';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/routing/app_router.dart';
import '../../../../core/widgets/app_drawer.dart';
import '../../anonymous_session/data/repositories/anonymous_session_repository.dart';
import '../bloc/vehicles_bloc.dart';
import '../bloc/vehicles_state.dart';
import '../data/models/vehicle_model.dart';

class VehicleCard extends StatelessWidget {
  const VehicleCard({super.key, required this.vehicle});

  final VehicleModel vehicle;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label:
          '${vehicle.make} ${vehicle.model} ${vehicle.year}, ${vehicle.licensePlate}',
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${vehicle.make} ${vehicle.model} (${vehicle.year})',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(
                vehicle.licensePlate,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              Text(
                'VIN: ${vehicle.vin}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (vehicle.lastPolicyStatus != null) ...[
                const SizedBox(height: 8),
                Chip(
                  label: Text(vehicle.lastPolicyStatus!),
                  backgroundColor: Colors.green.shade100,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class VehicleListScreen extends StatefulWidget {
  const VehicleListScreen({super.key});

  @override
  State<VehicleListScreen> createState() => _VehicleListScreenState();
}

class _VehicleListScreenState extends State<VehicleListScreen> {
  bool _creatingSession = false;

  Future<void> _startOcrFlow() async {
    if (_creatingSession) return;
    setState(() => _creatingSession = true);

    try {
      final repo = context.read<AnonymousSessionRepository>();
      final sessionToken = await repo.createSession();

      if (!mounted) return;

      context.push(
        '/vehicles/scan',
        extra: OcrWizardRouteArgs(
          sessionToken: sessionToken,
          onComplete: (fields) {
            final vin = fields['vin']?.value ?? '';
            final plate = fields['license_plate']?.value ?? '';
            context.go(
              '/vehicles/validate',
              extra: VehicleValidateRouteArgs(
                vin: vin,
                licensePlate: plate,
              ),
            );
          },
          onManualEntry: () {
            context.go(
              '/vehicles/validate',
              extra: const VehicleValidateRouteArgs(
                vin: '',
                licensePlate: '',
              ),
            );
          },
        ),
      );
    } catch (e) {
      log('Failed to create session', error: e);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Грешка при стартиране на сканиране. Опитайте пак.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _creatingSession = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Моите МПС-та'),
        actions: [
          if (_creatingSession)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: 'Добави МПС',
              onPressed: _startOcrFlow,
            ),
        ],
      ),
      drawer: const AppDrawer(),
      body: BlocBuilder<VehiclesBloc, VehiclesState>(
        builder: (context, state) {
          if (state is VehiclesLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is VehiclesError) {
            return Center(
              child: Text(
                state.message,
                style: const TextStyle(color: Colors.red),
              ),
            );
          }

          if (state is VehiclesEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.directions_car_outlined,
                    size: 80,
                    color: Colors.grey,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Нямате регистрирани МПС-та',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: Colors.grey,
                        ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Добавете МПС, за да заявите застраховка',
                    style: TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 24),
                  Semantics(
                    label: 'Добави МПС',
                    child: ElevatedButton.icon(
                      onPressed: _creatingSession ? null : _startOcrFlow,
                      icon: _creatingSession
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.camera_alt),
                      label: const Text('Сканирай талон'),
                    ),
                  ),
                ],
              ),
            );
          }

          if (state is VehiclesLoaded) {
            return ListView.builder(
              itemCount: state.vehicles.length,
              itemBuilder: (context, index) {
                return VehicleCard(vehicle: state.vehicles[index]);
              },
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

}
