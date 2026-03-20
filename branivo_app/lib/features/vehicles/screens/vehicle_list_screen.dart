import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/vehicles_bloc.dart';
import '../bloc/vehicles_event.dart';
import '../bloc/vehicles_state.dart';
import '../data/models/vehicle_model.dart';

class VehicleCard extends StatelessWidget {
  const VehicleCard({super.key, required this.vehicle});

  final VehicleModel vehicle;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${vehicle.make} ${vehicle.model} ${vehicle.year}, ${vehicle.licensePlate}',
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

class VehicleListScreen extends StatelessWidget {
  const VehicleListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Моите МПС-та'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Добави МПС',
            onPressed: () {
              // Navigate to add vehicle screen
            },
          ),
        ],
      ),
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
                  const Text('Нямате регистрирани МПС-та'),
                  const SizedBox(height: 16),
                  Semantics(
                    label: 'Добави МПС',
                    child: ElevatedButton(
                      onPressed: () {
                        // Navigate to add vehicle screen
                      },
                      child: const Text('Добави МПС'),
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

  static void loadVehicles(BuildContext context) {
    context.read<VehiclesBloc>().add(const LoadVehicles());
  }
}
