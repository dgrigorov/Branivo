import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/screens/login_screen.dart';
import '../../features/ocr/screens/ocr_wizard_screen.dart';
import '../../features/ocr/bloc/ocr_wizard_bloc.dart';
import '../../features/ocr/data/repositories/ocr_api_repository.dart';
import '../../features/ocr/data/repositories/ocr_models.dart';
import '../../features/vehicles/screens/vehicle_list_screen.dart';
import '../../features/vehicles/screens/vehicle_validation_screen.dart';
import '../../features/vehicles/bloc/vehicles_bloc.dart';
import '../../features/vehicles/bloc/vehicle_validation_bloc.dart';
import '../../features/vehicles/data/repositories/vehicles_repository.dart';
import '../../features/vehicles/data/repositories/vehicle_api_repository.dart';

/// Navigation extras for /vehicles/scan route
class OcrWizardRouteArgs {
  const OcrWizardRouteArgs({
    required this.sessionToken,
    required this.onComplete,
    required this.onManualEntry,
  });

  final String sessionToken;
  final void Function(Map<String, OcrField> fields) onComplete;
  final void Function() onManualEntry;
}

/// Navigation extras for /vehicles/validate route
class VehicleValidateRouteArgs {
  const VehicleValidateRouteArgs({
    required this.vin,
    required this.licensePlate,
  });

  final String vin;
  final String licensePlate;
}

class AppRouter {
  AppRouter._();

  static final GoRouter router = GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) {
          final repo = context.read<VehiclesRepository>();
          return BlocProvider(
            create: (_) => VehiclesBloc(repository: repo),
            child: const VehicleListScreen(),
          );
        },
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/vehicles',
        builder: (context, state) {
          final repo = context.read<VehiclesRepository>();
          return BlocProvider(
            create: (_) => VehiclesBloc(repository: repo),
            child: const VehicleListScreen(),
          );
        },
      ),
      GoRoute(
        path: '/vehicles/scan',
        builder: (context, state) {
          final args = state.extra as OcrWizardRouteArgs;
          final repo = context.read<OcrApiRepository>();
          return BlocProvider(
            create: (_) => OcrWizardBloc(repository: repo),
            child: OcrWizardScreen(
              sessionToken: args.sessionToken,
              onComplete: args.onComplete,
              onManualEntry: args.onManualEntry,
            ),
          );
        },
      ),
      GoRoute(
        path: '/vehicles/validate',
        builder: (context, state) {
          final args = state.extra as VehicleValidateRouteArgs;
          final repo = context.read<VehicleApiRepository>();
          return BlocProvider(
            create: (_) => VehicleValidationBloc(repository: repo),
            child: VehicleValidationScreen(
              vin: args.vin,
              licensePlate: args.licensePlate,
            ),
          );
        },
      ),
    ],
  );
}
